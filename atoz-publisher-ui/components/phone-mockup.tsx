import React from "react";
import Image from "next/image";
import {
  Bookmark,
  Heart,
  MessageCircle,
  MoreHorizontal,
  Send,
  Share2,
  ThumbsUp,
} from "lucide-react";

import type { Platform } from "@/types/api";

interface PhoneMockupProps {
  platform: Platform;
  authorName?: string;
  authorAvatar?: string;
  imageUrl?: string;
  caption?: string;
  likes?: number;
}

export function PhoneMockup({
  platform,
  authorName = "A to Z Flooring",
  authorAvatar = "/customcolor_logo_transparent_background.jpeg",
  imageUrl = "https://images.unsplash.com/photo-1581858726788-75bc0f6a952d?auto=format&fit=crop&w=800&q=80",
  caption = "Your Vision, Guaranteed. We'll walk you through moisture checks, product class, and realistic timelines.",
  likes = 124,
}: PhoneMockupProps) {
  const isFacebook = platform === "facebook";

  return (
    <div className="relative mx-auto w-[320px] shrink-0 overflow-hidden rounded-[3rem] border-[12px] border-zinc-900 bg-white shadow-2xl aspect-[9/19.5]">
      <div className="absolute top-0 inset-x-0 h-7 flex justify-center z-20">
        <div className="w-28 h-6 bg-zinc-900 rounded-b-3xl" />
      </div>

      <div
        className={`pt-10 pb-3 px-4 flex items-center justify-between border-b bg-white z-10 relative ${
          isFacebook ? "border-zinc-200" : "border-zinc-100"
        }`}
      >
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full overflow-hidden border border-zinc-200">
            <Image src={authorAvatar} alt="Avatar" className="w-full h-full object-cover" height={64} width={64} />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-zinc-900 tracking-tight leading-tight">
              {authorName}
            </span>
            {isFacebook && (
              <span className="text-[10px] text-zinc-400 leading-tight">Just now · 🌏</span>
            )}
          </div>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] uppercase font-medium text-white ${
              platform === "facebook"
                ? "bg-platform-facebook"
                : platform === "linkedin"
                  ? "bg-platform-linkedin"
                  : platform === "google_business"
                    ? "bg-platform-gbp"
                    : "bg-linear-to-r from-platform-instagram to-platform-instagram-end"
            }`}
          >
            {platform === "facebook" ? "FB" : platform === "linkedin" ? "LI" : platform === "google_business" ? "GBP" : "IG"}
          </span>
        </div>
        <MoreHorizontal className="w-5 h-5 text-zinc-500" />
      </div>

      <div className="h-[calc(100%-80px)] overflow-y-auto no-scrollbar bg-white">
        {isFacebook && caption && (
          <div className="px-4 pt-3 pb-2">
            <p className="text-sm text-zinc-800 leading-snug">{caption}</p>
          </div>
        )}

        <div className="w-full aspect-square bg-zinc-100">
          {imageUrl ? (
            <Image src={imageUrl} alt="Post preview" className="w-full h-full object-cover" height={1024} width={1024} />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-zinc-400 text-sm">No image</div>
          )}
        </div>

        {isFacebook ? (
          <>
            <div className="px-4 pt-2 pb-1 flex items-center justify-between text-xs text-zinc-400">
              <span>👍❤️ {likes}</span>
              <span>0 comments</span>
            </div>
            <div className="mx-4 border-t border-zinc-200" />
            <div className="px-4 py-2 flex items-center justify-around">
              <button className="flex items-center gap-1.5 text-xs text-zinc-600" type="button">
                <ThumbsUp className="w-5 h-5" /> Like
              </button>
              <button className="flex items-center gap-1.5 text-xs text-zinc-600" type="button">
                <MessageCircle className="w-5 h-5" /> Comment
              </button>
              <button className="flex items-center gap-1.5 text-xs text-zinc-600" type="button">
                <Share2 className="w-5 h-5" /> Share
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Heart className="w-6 h-6 text-zinc-800" />
                <MessageCircle className="w-6 h-6 text-zinc-800" />
                <Send className="w-6 h-6 text-zinc-800" />
              </div>
              <Bookmark className="w-6 h-6 text-zinc-800" />
            </div>
            <div className="px-4 pb-6">
              <p className="text-sm font-semibold text-zinc-900 mb-1">{likes} likes</p>
              <p className="text-sm text-zinc-800 leading-snug">
                <span className="font-semibold mr-2">{authorName}</span>
                {caption}
              </p>
            </div>
          </>
        )}
      </div>

      <div className="absolute bottom-2 inset-x-0 flex justify-center z-20 pointer-events-none">
        <div className="w-32 h-1 bg-zinc-900 rounded-full" />
      </div>
    </div>
  );
}
