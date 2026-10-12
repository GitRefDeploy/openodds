import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { DataProvider } from "./app/DataProvider";
import { ThemeProvider } from "./app/ThemeProvider";
import "./index.css";

const container = document.getElementById("root");
if (!container) throw new Error("Missing #root element");

createRoot(container).render(
  <StrictMode>
    <DataProvider>
      {/* Inside DataProvider: the stored preference lives in the database. */}
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </DataProvider>
  </StrictMode>,
);
