"use client";

import MyCardExistingPage from "./MyCardExistingPage";
import MyCardFirstTimeUserPage from "./MyCardFirstTimeUserPage";
import { MyCardDataModeProvider } from "./MyCardDataModeContext";
import { useDevPreviewMode } from "@/providers/DevPreviewModeProvider";

export default function MyCard1Feature() {
  const { newUserEmpty } = useDevPreviewMode();

  return (
    <MyCardDataModeProvider mode={newUserEmpty ? "first-time-user" : "existing"}>
      {newUserEmpty ? <MyCardFirstTimeUserPage /> : <MyCardExistingPage />}
    </MyCardDataModeProvider>
  );
}
