"use client";

import Link from "next/link";
import { GitBranch, Mail, ScrollText } from "lucide-react";

export default function Sidebar() {
  return (
    <aside className="w-64 h-screen border-r border-gray-200 px-6 py-8 flex flex-col justify-between">
      {/* 상단 영역 */}
      <div>
        {/* 프로필 */}
        <div className="mb-10">
          <div className="w-24 h-24 rounded-full bg-gray-300 mb-4" />
          <h1 className="text-xl font-semibold">미니</h1>
          <p className="text-sm text-gray-500 mt-1">프론트엔드 개발 블로그</p>
        </div>

        {/* 전체 보기 */}
        <nav className="mb-6">
          <Link
            href="/"
            className="block text-sm font-medium hover:text-black transition-colors"
          >
            전체 보기
          </Link>
        </nav>

        {/* 카테고리 */}
        <div>
          <h2 className="text-sm font-semibold text-gray-500 mb-3">
            Categories
          </h2>
          <ul className="space-y-2 text-sm">
            <li>
              <Link href="/category/frontend" className="hover:text-black">
                Frontend
              </Link>
            </li>
            <li>
              <Link href="/category/backend" className="hover:text-black">
                Backend
              </Link>
            </li>
            <li>
              <Link href="/category/devops" className="hover:text-black">
                DevOps
              </Link>
            </li>
          </ul>
        </div>
      </div>

      {/* 하단 아이콘 */}
      <div className="flex gap-4 text-gray-500">
        <a
          href="https://github.com/psycheew"
          target="_blank"
          className="hover:text-black transition-colors"
        >
          <GitBranch size={20} />
        </a>

        <a
          href="mailto:your@email.com"
          className="hover:text-black transition-colors"
        >
          <Mail size={20} />
        </a>

        <a
          href="https://portfolio.com"
          target="_blank"
          className="hover:text-black transition-colors"
        >
          <ScrollText size={20} />
        </a>
      </div>
    </aside>
  );
}
