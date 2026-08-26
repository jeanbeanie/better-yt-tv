// Minimal shapes for the YouTube Data API responses this app reads —
// only the fields actually accessed, not the full API surface.

export type YoutubeChannelsListResponse = {
  items?: {
    contentDetails?: {
      relatedPlaylists?: {
        uploads?: string;
      };
    };
  }[];
};

export type YoutubePlaylistItem = {
  snippet?: {
    resourceId?: {
      videoId?: string;
    };
    channelId?: string;
    title?: string;
    publishedAt?: string;
    thumbnails?: {
      medium?: { url?: string };
      default?: { url?: string };
    };
  };
};

export type YoutubePlaylistItemsListResponse = {
  items?: YoutubePlaylistItem[];
};

export type YoutubeSubscriptionListItem = {
  snippet?: {
    resourceId?: {
      channelId?: string;
    };
    title?: string;
    thumbnails?: {
      medium?: { url?: string };
      default?: { url?: string };
    };
  };
};

export type YoutubeSubscriptionsListResponse = {
  items?: YoutubeSubscriptionListItem[];
  nextPageToken?: string;
};
