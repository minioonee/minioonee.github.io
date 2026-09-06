#!/usr/bin/env node
//
// Sync posts with Status = "발행" from a Notion database into _posts/.
// Run via .github/workflows/notion-sync.yml.

import fs from "node:fs";
import path from "node:path";
import https from "node:https";
import { Client } from "@notionhq/client";
import { NotionToMarkdown } from "notion-to-md";
import matter from "gray-matter";

const NOTION_TOKEN = process.env.NOTION_TOKEN;
const DATABASE_ID = process.env.NOTION_DATABASE_ID;
const PUBLISHED_STATUS = process.env.NOTION_PUBLISHED_STATUS || "발행";

if (!NOTION_TOKEN || !DATABASE_ID) {
  console.error("NOTION_TOKEN and NOTION_DATABASE_ID must be set.");
  process.exit(1);
}

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const POSTS_DIR = path.join(ROOT, "_posts");
const IMAGES_ROOT = path.join(ROOT, "assets", "img", "posts");
const CHANGED_MARKER = path.join(ROOT, ".notion-sync-changed");

const notion = new Client({ auth: NOTION_TOKEN });
const n2m = new NotionToMarkdown({ notionClient: notion });

function slugify(text) {
  return (
    text
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s-]/gu, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-") || "untitled"
  );
}

function formatFrontmatterDate(dateStr) {
  const d = dateStr ? new Date(dateStr) : new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}:${pad(d.getSeconds())} +0900`;
}

function extFromUrl(url) {
  const clean = url.split("?")[0];
  const ext = path.extname(clean);
  return ext && ext.length <= 5 ? ext : ".png";
}

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          downloadFile(res.headers.location, destPath).then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`Failed to download ${url}: HTTP ${res.statusCode}`));
          return;
        }
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        const fileStream = fs.createWriteStream(destPath);
        res.pipe(fileStream);
        fileStream.on("finish", () => fileStream.close(() => resolve()));
        fileStream.on("error", reject);
      })
      .on("error", reject);
  });
}

async function getPublishedPages() {
  const results = [];
  let cursor;
  do {
    const res = await notion.databases.query({
      database_id: DATABASE_ID,
      filter: {
        property: "Status",
        select: { equals: PUBLISHED_STATUS },
      },
      start_cursor: cursor,
    });
    results.push(...res.results);
    cursor = res.has_more ? (res.next_cursor ?? undefined) : undefined;
  } while (cursor);
  return results;
}

function getTitle(page) {
  const prop = page.properties.Title;
  return prop?.title?.map((t) => t.plain_text).join("") || "Untitled";
}

function getDate(page) {
  return page.properties.Date?.date?.start || null;
}

function getCategory(page) {
  return page.properties.Category?.select?.name || null;
}

function getTags(page) {
  return page.properties.Tags?.multi_select?.map((t) => t.name) || [];
}

function findExistingFile(pageId) {
  if (!fs.existsSync(POSTS_DIR)) return null;
  for (const file of fs.readdirSync(POSTS_DIR)) {
    if (!file.endsWith(".md")) continue;
    const full = path.join(POSTS_DIR, file);
    const { data } = matter(fs.readFileSync(full, "utf-8"));
    if (data.notion_id === pageId) return full;
  }
  return null;
}

async function downloadCover(page, slug) {
  const cover = page.cover;
  if (!cover) return null;
  const url = cover.type === "external" ? cover.external.url : cover.file.url;
  const destRelative = path.posix.join("assets", "img", "posts", slug, `cover${extFromUrl(url)}`);
  await downloadFile(url, path.join(ROOT, destRelative));
  return `/${destRelative}`;
}

async function convertPageToMarkdown(pageId, slug) {
  let imageIndex = 0;
  n2m.setCustomTransformer("image", async (block) => {
    const { image } = block;
    const url = image?.file?.url || image?.external?.url;
    if (!url) return "";
    imageIndex += 1;
    const destRelative = path.posix.join(
      "assets",
      "img",
      "posts",
      slug,
      `image-${imageIndex}${extFromUrl(url)}`,
    );
    try {
      await downloadFile(url, path.join(ROOT, destRelative));
    } catch (err) {
      console.error(`  ! failed to download image: ${err.message}`);
      return "";
    }
    const caption = image.caption?.map((c) => c.plain_text).join("") || "";
    return `![${caption}](/${destRelative})`;
  });

  const mdBlocks = await n2m.pageToMarkdown(pageId);
  const mdString = n2m.toMarkdownString(mdBlocks);
  return mdString.parent;
}

async function main() {
  const pages = await getPublishedPages();
  console.log(`Found ${pages.length} page(s) with Status = "${PUBLISHED_STATUS}".`);

  let changed = false;

  for (const page of pages) {
    const title = getTitle(page);
    const dateStr = getDate(page);
    const lastEdited = page.last_edited_time;

    const existingFile = findExistingFile(page.id);
    if (existingFile) {
      const { data } = matter(fs.readFileSync(existingFile, "utf-8"));
      if (data.notion_last_edited === lastEdited) {
        console.log(`- skip (unchanged): ${title}`);
        continue;
      }
    }

    const slug = slugify(title);
    const dateOnly = (dateStr || new Date().toISOString()).slice(0, 10);
    const filename = `${dateOnly}-${slug}.md`;
    const filePath = path.join(POSTS_DIR, filename);

    console.log(`- syncing: ${title} -> ${filename}`);

    const coverImage = await downloadCover(page, slug);
    const body = await convertPageToMarkdown(page.id, slug);

    const frontmatter = {
      title,
      date: formatFrontmatterDate(dateStr),
      categories: getCategory(page) ? [getCategory(page)] : [],
      tags: getTags(page),
      notion_id: page.id,
      notion_last_edited: lastEdited,
    };
    if (coverImage) frontmatter.image = coverImage;

    const fileContent = matter.stringify(body, frontmatter);

    if (existingFile && existingFile !== filePath) {
      fs.rmSync(existingFile);
    }

    fs.mkdirSync(POSTS_DIR, { recursive: true });
    fs.writeFileSync(filePath, fileContent, "utf-8");
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(CHANGED_MARKER, "1");
    console.log("Done: changes written.");
  } else {
    console.log("Done: nothing to sync.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
