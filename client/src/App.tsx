import { useState } from 'react';
import { whoami } from "./whoamiTest";

function App() {
  const [data, setData] = useState(null);

  return (
    <div>
      <nav>
        <a href="http://localhost:5179/api/auth/login">Login with Google</a>
      </nav>
      <h1>Better YT TV</h1>
      <button
        onClick={async () => {
          const json = await whoami();
          setData(json);
        }}
      >
        Who am I?
      </button>

      <pre>{JSON.stringify(data, null, 2)}</pre>
    </div>
  )
}

export default App
