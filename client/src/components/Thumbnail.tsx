import { useEffect, useState, type CSSProperties, type ReactNode } from "react";

type ThumbnailProps = {
  src: string | null;
  alt: string;
  width: number;
  height?: number;
  style?: CSSProperties;
  loading?: "lazy" | "eager";
  fallback?: ReactNode;
};

export default function Thumbnail({
  src,
  alt,
  width,
  height,
  style,
  loading,
  fallback = null,
}: ThumbnailProps) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (!src || failed) {
    return <>{fallback}</>;
  }

  return (
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      loading={loading}
      style={style}
      onError={() => setFailed(true)}
    />
  );
}
