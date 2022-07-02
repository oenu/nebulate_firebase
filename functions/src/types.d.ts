interface Channel {
  nebulaId: string;
  type: string;
  slug: string;
  title: string;
  description: string;
  zypeId: string;
  youtubeId: string;
  youtubeChannelName: string;
  uploadPlaylistId: string;
  lastScrapedNebula?: Date;
  lastScrapedYoutube?: Date;
  lastMatched?: Date;
  nebulaVideos?: NebulaVideo[];
  youtubeVideos?: YoutubeVideo[];
}

export interface NebulaVideo {
  nebulaVideoId: string;
  slug: string;
  title: string;
  shortDescription: string;
  duration: number;
  published_at: Date;
  channelId: string;
  channelSlug: string;
  channelSlugs: string[];
  channelTitle: string;
  shareUrl: string;
  matched: boolean;
  youtubeVideoId?: string;
  matchStrength?: number;
}

export interface YoutubeVideo {
  youtubeVideoId: string;
  publishedAt: Date;
  playlistId: string;
  channelTitle: string;
  title: string;
  channelId: string;
  etag: string;
  status: string;
  channelSlug: string;
}
