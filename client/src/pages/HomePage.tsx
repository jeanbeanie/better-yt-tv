import { Link } from "react-router-dom";
import { type User } from "../App";


type homePageProps = {
  user: User | null;
  error: string | null;
  loading: boolean;
}

export default function HomePage(props:homePageProps) {
  const {user, error, loading} = props;

  return (
    <main>
      <h1>Better YT TV</h1>
      <p>A better way to browse your YouTube subscriptions.</p>

      {loading && <p>Loading user...</p>}

      {error && <p style={{ color: "red" }}>{error}</p>}

      {!loading && user && (
        <div>
          <p>Logged in as: <strong>{user.email ?? "No email found"}</strong></p>

            <Link to="/all">Go to /all videos</Link>
        </div>
      )}
    </main>
  );
}
