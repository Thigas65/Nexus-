import React from "react";
import ReactDOM from "react-dom/client";
import { Capacitor } from "@capacitor/core";
import { registerSW } from "virtual:pwa-register";
import App from "./app/App";
import "./app/styles.css";

if (
  import.meta.env.PROD &&
  !Capacitor.isNativePlatform() &&
  (window.location.protocol === "https:" ||
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1")
) {
  registerSW({
    immediate: true,
    onRegisterError(error: unknown) {
      console.error("Não foi possível registrar o service worker do N.E.X.U.S.", error);
    },
  });
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
