import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  getListsSummary,
  type ListCardSummary,
  type ListCardVideo,
} from "../lib/api";
import { useAuthRedirect } from "../lib/useAuthRedirect";
import { readSavedListVideos, saveListVideo } from "../lib/listResume";
import ErrorText from "./ErrorText";
import MutedText from "./MutedText";
import Spinner from "./Spinner";
import Thumbnail from "./Thumbnail";

const MAX_AVATARS = 5;

export default function ListsGrid() {
  const [lists, setLists] = useState<ListCardSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const redirectIfAuthError = useAuthRedirect(setError);

  async function loadSummary() {
    try {
      setLoading(true);
      setError(null);

      // saved videos are read fresh on every mount
      const data = await getListsSummary(readSavedListVideos());
      setLists(data.lists ?? []);
    } catch (err) {
      if (redirectIfAuthError(err)) return;
      setError(err instanceof Error ? err.message : "Failed to load lists");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadSummary();
  }, []);

  const loaded = !loading && !error;
  const showViewAll = loaded && lists.length > 0;

  return (
    <section className="lists-grid" aria-labelledby="lists-grid-heading">
      <div className="lists-grid-header">
        <h2 id="lists-grid-heading">Your lists</h2>
        {showViewAll && (
          <Link to="/settings/lists">
            View all lists <span aria-hidden="true">→</span>
          </Link>
        )}
      </div>

      {loading && <Spinner label="Loading lists..." />}
      {error && <ErrorText>{error}</ErrorText>}

      {loaded && lists.length === 0 && (
        <MutedText>
          You don't have any lists yet. <Link to="/settings/lists">Create one</Link>
        </MutedText>
      )}

      {loaded && lists.length > 0 && (
        <ul className="lists-grid-items">
          {lists.map((list) => (
            <li key={list.id} className="list-card">
              <ListCard list={list} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

type ListCardProps = {
  list: ListCardSummary;
};

function ListCard({ list }: ListCardProps) {
  const { id, name, channels, videoCount, unwatchedCount, featuredVideo } = list;
  const listHref = `/lists?listId=${id}`;
  const channelLabel = `${channels.length} ${channels.length === 1 ? "channel" : "channels"}`;

  // only a next video is written, a resume video is already saved
  function handleOpen() {
    if (featuredVideo?.kind === "next") saveListVideo(id, featuredVideo.videoId);
  }

  let badge = "0 videos";
  if (unwatchedCount > 0) badge = `${unwatchedCount} unwatched`;
  else if (videoCount > 0) badge = "All caught up";

  return (
    <>
      <div className="list-card-top">
        <h3 className="list-card-name">
          <Link to={listHref} onClick={handleOpen}>
            {name}
          </Link>
        </h3>
        <span className="list-card-badge">{badge}</span>
      </div>

      <div className="list-card-channels">
        {channels.length > 0 && (
          <span className="list-card-avatars" aria-hidden="true">
            {channels.slice(0, MAX_AVATARS).map((channel, index) => (
              <span
                key={channel.channelId}
                className={`list-card-avatar list-card-avatar-color-${(index % 3) + 1}`}
              >
                <Thumbnail
                  src={channel.thumbUrl}
                  alt=""
                  width={24}
                  fallback={
                    <span className="list-card-avatar-letter">
                      {channel.title.charAt(0).toUpperCase()}
                    </span>
                  }
                />
              </span>
            ))}
          </span>
        )}
        <span className="text-muted">{channelLabel}</span>
      </div>

      {featuredVideo ? (
        <Link
          to={listHref}
          onClick={handleOpen}
          className="list-card-thumb list-card-thumb-play"
          tabIndex={-1}
          aria-hidden="true"
        >
          <FeaturedThumb video={featuredVideo} />
        </Link>
      ) : (
        <div className="list-card-thumb list-card-thumb-empty" />
      )}

      <p className="list-card-caption">
        {featuredVideo
          ? `${featuredVideo.kind === "resume" ? "Continue watching" : "Up next"}: ${featuredVideo.title}`
          : "No videos in list, add more channels to start watching!"}
      </p>

      {featuredVideo ? (
        <Link
          to={listHref}
          onClick={handleOpen}
          className="button button-primary list-card-button"
          aria-label={`Watch ${name}`}
        >
          <svg
            aria-hidden="true"
            focusable="false"
            width="1em"
            height="1em"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          >
            <path d="M7 4.5v15l12-7.5z" />
          </svg>
          Watch
        </Link>
      ) : (
        <Link
          to={`/settings/lists/${id}`}
          className="button button-primary list-card-button"
          aria-label={`Edit list ${name}`}
        >
          Edit list
        </Link>
      )}
    </>
  );
}

type FeaturedThumbProps = {
  video: ListCardVideo;
};

function FeaturedThumb({ video }: FeaturedThumbProps) {
  return (
    <Thumbnail
      src={video.thumbUrl}
      alt=""
      width={320}
      fallback={<span className="list-card-thumb-placeholder" />}
    />
  );
}
