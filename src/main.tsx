import "./styles/tokens.css";
import "./styles/base.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App.js";
import { findMissingApis } from "./app/compat.js";
import { startServices } from "./app/services.js";
import { UnsupportedScreen } from "./app/UnsupportedScreen.js";

const container = document.getElementById("root");
if (!container) throw new Error("#root element missing from index.html");
const root = createRoot(container);

const missing = findMissingApis(window);
if (missing.length > 0) {
  root.render(<UnsupportedScreen missing={missing} />);
} else {
  startServices();
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
