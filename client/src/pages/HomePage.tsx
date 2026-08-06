import { Link } from "react-router-dom";
import { type User } from "../App";
import ErrorText from "../components/ErrorText";


type homePageProps = {
  user: User | null;
  error: string | null;
  loading: boolean;
}

export default function HomePage(props:homePageProps) {
  const {user, error, loading} = props;

  return (
    <main>
      <h1>YT Catchup</h1>
      <div style={{ margin: "6rem 0" }}>
        <p>A better way to browse your YouTube subscriptions.</p>

        {loading && <p>Loading user...</p>}

        {error && <ErrorText>{error}</ErrorText>}

        {!loading && user && (
          <div>
            <p>Logged in as: <strong>{user.email ?? "No email found"}</strong></p>

            <Link to="/all">Go to /all videos</Link>
          </div>
        )}
      </div>
    </main>
  );
}
