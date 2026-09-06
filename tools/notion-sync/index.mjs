#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import { Client } from '@notionhq/client';
import { NotionToMarkdown } from 'notion-to-md';
import matter from 'gray-matter';

const TOKEN = process.env.NOTION_TOKEN;
const DATABASE_ID = process.env.NOTION_DATABASE_ID;
const PUBLISHED = process.env.NOTION_PUBLISHED_STATUS || '발행';
if (!TOKEN || !DATABASE_ID) {
  console.error('NOTION_TOKEN and NOTION_DATABASE_ID must be set.');
  process.exit(1);
}

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const POSTS = path.join(ROOT, '_posts');
const IMAGES = path.join(ROOT, 'assets', 'img', 'posts');
const TEMP = path.join(ROOT, '.notion-sync-tmp');
const MARKER = path.join(ROOT, '.notion-sync-changed');
const notion = new Client({ auth: TOKEN });
const n2m = new NotionToMarkdown({ notionClient: notion });

const textValue = (property, type) =>
  property?.[type]?.map((item) => item.plain_text).join('') || '';
const titleOf = (page) => textValue(page.properties.Title, 'title') || 'Untitled';
const dateOf = (page) => page.properties.Date?.date?.start || null;
const statusOf = (page) => page.properties.Status?.select?.name || null;
const categoryOf = (page) => page.properties.Category?.select?.name || null;
const tagsOf = (page) => page.properties.Tags?.multi_select?.map((item) => item.name) || [];

function slugify(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

const slugOf = (page) => slugify(textValue(page.properties.Slug, 'rich_text'));

function formattedDate(value) {
  if (!value) throw new Error('Date is required');
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value} 00:00:00 +0900`;
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) throw new Error(`invalid Date value: ${value}`);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const get = (type) => parts.find((item) => item.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')} +0900`;
}

function extensionOf(url) {
  const extension = path.extname(new URL(url).pathname).toLowerCase();
  return /^\.[a-z0-9]{1,5}$/.test(extension) ? extension : '.img';
}

function normalizeCodeLanguage(language) {
  const normalized = (language || 'plaintext').trim().toLowerCase();
  const aliases = {
    'plain text': 'plaintext',
    'c++': 'cpp',
    'c#': 'csharp',
    'f#': 'fsharp',
    'visual basic': 'vb',
  };
  return aliases[normalized]
    || normalized.replace(/\s+/g, '-').replace(/[^a-z0-9_+.#-]/g, '')
    || 'plaintext';
}

function codeBlockMarkdown(block) {
  const code = textValue(block.code, 'rich_text');
  if (!code) return '';
  const longestBackticks = Math.max(
    0,
    ...(code.match(/`+/g) || []).map((run) => run.length),
  );
  const fence = '`'.repeat(Math.max(3, longestBackticks + 1));
  return `${fence}${normalizeCodeLanguage(block.code.language)}\n${code.replace(/\n+$/, '')}\n${fence}`;
}

function validateCodeFences(markdown) {
  let opening = null;
  for (const [index, line] of markdown.split('\n').entries()) {
    const match = line.match(/^(`{3,})([^`]*)$/);
    if (!match) continue;
    if (!opening) {
      if (/\s/.test(match[2].trim())) {
        throw new Error(`code fence on line ${index + 1} has an invalid language identifier`);
      }
      opening = { length: match[1].length, line: index + 1 };
    } else if (!match[2].trim() && match[1].length >= opening.length) {
      opening = null;
    }
  }
  if (opening) throw new Error(`code fence opened on line ${opening.line} is not closed`);
}

function download(url, destination, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error('too many redirects'));
    const request = https.get(url, { timeout: 30_000 }, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        const next = new URL(response.headers.location, url);
        if (next.protocol !== 'https:') return reject(new Error('redirected to a non-HTTPS URL'));
        return download(next.href, destination, redirects + 1).then(resolve, reject);
      }
      if (response.statusCode !== 200) {
        response.resume();
        return reject(new Error(`HTTP ${response.statusCode}`));
      }
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      const output = fs.createWriteStream(destination, { flags: 'wx' });
      response.pipe(output);
      output.on('finish', () => output.close(resolve));
      output.on('error', (error) => {
        response.destroy();
        fs.rmSync(destination, { force: true });
        reject(error);
      });
    });
    request.on('timeout', () => request.destroy(new Error('download timed out')));
    request.on('error', (error) => {
      fs.rmSync(destination, { force: true });
      reject(error);
    });
  });
}

async function dataSourceId() {
  const database = await notion.databases.retrieve({ database_id: DATABASE_ID });
  const sources = 'data_sources' in database ? database.data_sources : [];
  if (sources.length !== 1) {
    throw new Error(`NOTION_DATABASE_ID must identify a database with exactly one data source; found ${sources.length}`);
  }
  return sources[0].id;
}

async function queryPages(sourceId, filter) {
  const pages = [];
  let cursor;
  do {
    const response = await notion.dataSources.query({
      data_source_id: sourceId,
      result_type: 'page',
      ...(filter ? { filter } : {}),
      ...(cursor ? { start_cursor: cursor } : {}),
    });
    pages.push(...response.results.filter((item) => item.object === 'page'));
    cursor = response.has_more ? response.next_cursor : undefined;
  } while (cursor);
  return pages;
}

function managedPosts() {
  if (!fs.existsSync(POSTS)) return [];
  return fs
    .readdirSync(POSTS)
    .filter((name) => name.endsWith('.md'))
    .map((name) => {
      const filePath = path.join(POSTS, name);
      return { filePath, data: matter(fs.readFileSync(filePath, 'utf8')).data };
    })
    .filter((post) => typeof post.data.notion_id === 'string');
}

function validate(pages, posts) {
  const errors = [];
  const ids = new Set();
  const slugs = new Map();
  for (const post of posts) {
    if (ids.has(post.data.notion_id)) errors.push(`notion_id ${post.data.notion_id} exists in multiple Markdown files`);
    ids.add(post.data.notion_id);
  }
  ids.clear();
  for (const page of pages) {
    const label = `"${titleOf(page)}" (${page.id})`;
    const slug = slugOf(page);
    if (!dateOf(page)) errors.push(`${label}: Date is required`);
    else {
      try { formattedDate(dateOf(page)); } catch (error) { errors.push(`${label}: ${error.message}`); }
    }
    if (!slug) errors.push(`${label}: Slug rich-text property is required`);
    if (ids.has(page.id)) errors.push(`${label}: duplicate page returned by Notion`);
    ids.add(page.id);
    if (slug && slugs.has(slug) && slugs.get(slug) !== page.id) errors.push(`Slug "${slug}" is used by multiple published pages`);
    slugs.set(slug, page.id);
    if (slug) {
      const permalink = `/posts/${slug}/`;
      const conflictingSlugPost = posts.find(
        (post) => post.data.notion_id !== page.id && post.data.permalink === permalink,
      );
      if (conflictingSlugPost) {
        errors.push(`${label}: Slug "${slug}" is already used by notion_id ${conflictingSlugPost.data.notion_id}`);
      }

      const targetAssets = path.join(IMAGES, slug);
      const conflictingPost = posts.find(
        (post) => post.data.notion_id !== page.id && assetDirectory(post) === targetAssets,
      );
      if (conflictingPost) {
        errors.push(`${label}: image path is owned by notion_id ${conflictingPost.data.notion_id}`);
      } else if (
        fs.existsSync(targetAssets)
        && !posts.some((post) => post.data.notion_id === page.id && assetDirectory(post) === targetAssets)
      ) {
        errors.push(`${label}: image path already exists without matching notion_id ownership`);
      }

      if (dateOf(page)) {
        const targetMarkdown = path.join(POSTS, `${formattedDate(dateOf(page)).slice(0, 10)}-${slug}.md`);
        if (fs.existsSync(targetMarkdown)) {
          const owner = matter(fs.readFileSync(targetMarkdown, 'utf8')).data.notion_id;
          if (owner !== page.id) {
            errors.push(`${label}: Markdown path is owned by notion_id ${owner || '<none>'}`);
          }
        }
      }
    }
  }
  if (errors.length) throw new Error(`Published page validation failed:\n- ${errors.join('\n- ')}`);
}

function assetDirectory(post) {
  let relative = post.data.notion_asset_dir;
  if (typeof relative !== 'string' && typeof post.data.image === 'string') {
    relative = path.posix.dirname(post.data.image.replace(/^\//, ''));
  }
  if (typeof relative !== 'string' || !relative.startsWith('assets/img/posts/')) return null;
  const absolute = path.resolve(ROOT, relative);
  return absolute.startsWith(`${IMAGES}${path.sep}`) ? absolute : null;
}

async function markdownFor(page, publicAssets, temporaryAssets) {
  let imageNumber = 0;
  n2m.setCustomTransformer('image', async (block) => {
    const url = block.image?.file?.url || block.image?.external?.url;
    if (!url) throw new Error(`image block ${block.id} has no downloadable URL`);
    const filename = `image-${++imageNumber}${extensionOf(url)}`;
    try {
      await download(url, path.join(temporaryAssets, filename));
    } catch (error) {
      throw new Error(`image block ${block.id} download failed: ${error.message}`);
    }
    const caption = textValue(block.image, 'caption')
      .replaceAll('[', ' ')
      .replaceAll(']', ' ')
      .replace(/[\r\n]/g, ' ');
    return `![${caption}](/${path.posix.join(publicAssets, filename)})`;
  });
  n2m.setCustomTransformer('code', codeBlockMarkdown);
  const markdown = n2m.toMarkdownString(await n2m.pageToMarkdown(page.id)).parent;
  validateCodeFences(markdown);
  return markdown;
}

async function prepare(page) {
  const slug = slugOf(page);
  const assetName = slug;
  const publicAssets = path.posix.join('assets', 'img', 'posts', assetName);
  const temporaryDirectory = fs.mkdtempSync(path.join(TEMP, 'page-'));
  const temporaryAssets = path.join(temporaryDirectory, 'assets');
  fs.mkdirSync(temporaryAssets, { recursive: true });
  try {
    let cover;
    if (page.cover) {
      const url = page.cover.type === 'external' ? page.cover.external.url : page.cover.file.url;
      const filename = `cover${extensionOf(url)}`;
      try { await download(url, path.join(temporaryAssets, filename)); }
      catch (error) { throw new Error(`cover download failed: ${error.message}`); }
      cover = `/${path.posix.join(publicAssets, filename)}`;
    }
    const body = await markdownFor(page, publicAssets, temporaryAssets);
    const category = categoryOf(page);
    const frontmatter = {
      title: titleOf(page),
      date: formattedDate(dateOf(page)),
      permalink: `/posts/${slug}/`,
      categories: category ? [category] : [],
      tags: tagsOf(page),
      notion_id: page.id,
      notion_last_edited: page.last_edited_time,
      notion_asset_dir: publicAssets,
      notion_sync_version: 4,
    };
    if (cover) frontmatter.image = cover;
    const filename = `${formattedDate(dateOf(page)).slice(0, 10)}-${slug}.md`;
    const temporaryMarkdown = path.join(temporaryDirectory, filename);
    fs.writeFileSync(temporaryMarkdown, matter.stringify(body, frontmatter), 'utf8');
    return {
      temporaryDirectory,
      temporaryAssets,
      temporaryMarkdown,
      finalAssets: path.join(IMAGES, assetName),
      finalMarkdown: path.join(POSTS, filename),
    };
  } catch (error) {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
    throw new Error(`"${titleOf(page)}" (${page.id}) preparation failed: ${error.message}`);
  }
}

function assertOwner(filePath, pageId) {
  if (!fs.existsSync(filePath)) return;
  const owner = matter(fs.readFileSync(filePath, 'utf8')).data.notion_id;
  if (owner !== pageId) throw new Error(`refusing to overwrite ${path.relative(ROOT, filePath)} owned by notion_id ${owner || '<none>'}`);
}

function install(prepared, page, previous) {
  assertOwner(prepared.finalMarkdown, page.id);
  fs.mkdirSync(POSTS, { recursive: true });
  fs.mkdirSync(IMAGES, { recursive: true });
  const backupAssets = `${prepared.finalAssets}.backup-${process.pid}`;
  const backupMarkdown = `${prepared.finalMarkdown}.backup-${process.pid}`;
  let assetsBackedUp = false;
  let assetsInstalled = false;
  let markdownBackedUp = false;
  let markdownInstalled = false;
  try {
    if (fs.existsSync(prepared.finalAssets)) {
      fs.renameSync(prepared.finalAssets, backupAssets);
      assetsBackedUp = true;
    }
    fs.renameSync(prepared.temporaryAssets, prepared.finalAssets);
    assetsInstalled = true;
    if (fs.existsSync(prepared.finalMarkdown)) {
      fs.renameSync(prepared.finalMarkdown, backupMarkdown);
      markdownBackedUp = true;
    }
    fs.renameSync(prepared.temporaryMarkdown, prepared.finalMarkdown);
    markdownInstalled = true;
  } catch (error) {
    if (assetsInstalled) fs.rmSync(prepared.finalAssets, { recursive: true, force: true });
    if (markdownInstalled) fs.rmSync(prepared.finalMarkdown, { force: true });
    if (assetsBackedUp) fs.renameSync(backupAssets, prepared.finalAssets);
    if (markdownBackedUp) fs.renameSync(backupMarkdown, prepared.finalMarkdown);
    throw error;
  }
  fs.rmSync(backupAssets, { recursive: true, force: true });
  fs.rmSync(backupMarkdown, { force: true });
  if (previous && previous.filePath !== prepared.finalMarkdown) fs.rmSync(previous.filePath, { force: true });
  const oldAssets = previous ? assetDirectory(previous) : null;
  if (oldAssets && oldAssets !== prepared.finalAssets) fs.rmSync(oldAssets, { recursive: true, force: true });
  fs.rmSync(prepared.temporaryDirectory, { recursive: true, force: true });
}

function removeUnpublished(posts, pagesById) {
  let changed = false;
  for (const post of posts) {
    const page = pagesById.get(post.data.notion_id);
    if (!page || statusOf(page) === PUBLISHED) continue;
    console.log(`- removing unpublished page: ${path.basename(post.filePath)}`);
    fs.rmSync(post.filePath, { force: true });
    const assets = assetDirectory(post);
    if (assets) fs.rmSync(assets, { recursive: true, force: true });
    changed = true;
  }
  return changed;
}

async function main() {
  fs.rmSync(MARKER, { force: true });
  fs.rmSync(TEMP, { recursive: true, force: true });
  fs.mkdirSync(TEMP, { recursive: true });
  try {
    const sourceId = await dataSourceId();
    const published = await queryPages(sourceId, { property: 'Status', select: { equals: PUBLISHED } });
    const all = await queryPages(sourceId);
    const posts = managedPosts();
    validate(published, posts);
    console.log(`Found ${published.length} published page(s).`);
    let changed = false;
    for (const page of published) {
      const previous = posts.find((post) => post.data.notion_id === page.id);
      const previousAssets = previous ? assetDirectory(previous) : null;
      if (
        previous?.data.notion_sync_version === 4
        && previous.data.notion_last_edited === page.last_edited_time
        && previousAssets
        && fs.existsSync(previousAssets)
      ) {
        console.log(`- skip (unchanged): ${titleOf(page)}`);
        continue;
      }
      console.log(`- syncing: ${titleOf(page)}`);
      const prepared = await prepare(page);
      install(prepared, page, previous);
      changed = true;
    }
    changed = removeUnpublished(posts, new Map(all.map((page) => [page.id, page]))) || changed;
    if (changed) {
      fs.writeFileSync(MARKER, '1', 'utf8');
      console.log('Done: changes written.');
    } else console.log('Done: nothing to sync.');
  } finally {
    fs.rmSync(TEMP, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`Notion sync failed: ${error.message}`);
  process.exit(1);
});
