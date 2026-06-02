import { Link, Route, Routes } from "react-router-dom";
import HomePage from "./pages/HomePage";
import AllPage from "./pages/AllPage";

function App() {
  return (
    <div style={{ padding: "2rem", fontFamily: "sans-serif" }}>
      <header style={{ marginBottom: "2rem" }}>
        <nav style={{ display: "flex", gap: "1rem" }}>
          <Link to="/">Home</Link>
          <Link to="/all">All</Link>
        </nav>
      </header>

      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/all" element={<AllPage />} />
      </Routes>
    </div>
  );
}

export default App;
