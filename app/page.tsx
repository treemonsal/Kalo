import { cookies } from "next/headers";
import { appearance, appearanceCookie } from "../lib/appearance";
import { chatGPTSignInPath, getChatGPTUser } from "./chatgpt-auth";
import Kalo from "./kalo/app";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getChatGPTUser();
  if (!user) return (
    <main className="sign-in">
      <span className="eyebrow">Deine Lernbibliothek</span>
      <h1>Kalo</h1>
      <p>Deine Karteikarten und dein Lernstand sind mit deinem ChatGPT Konto verbunden.</p>
      <a className="primary button" href={chatGPTSignInPath("/")} target="_top">Mit ChatGPT anmelden</a>
    </main>
  );
  const theme = appearance((await cookies()).get(appearanceCookie)?.value);
  return <Kalo accountId={user.userId} initialAppearance={theme} />;
}
