import { cookies } from "next/headers";
import { appearance, appearanceCookie } from "../lib/appearance";
import { design, designCookie } from "../lib/design";
import { chatGPTSignInPath, getChatGPTUser } from "./chatgpt-auth";
import Kalo from "./kalo/app";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await getChatGPTUser();
  const preferences = await cookies();
  const selectedDesign = design(preferences.get(designCookie)?.value);
  if (!user) return (
    <main className="sign-in">
      {selectedDesign === "classic" ? <span className="eyebrow">Deine Lernbibliothek</span>
        // eslint-disable-next-line @next/next/no-img-element -- kleines SVG, keine Optimierung nötig
        : <img className="sign-in-mark" src="/kalo-brown-128.png" width="64" height="64" alt="" />}
      <h1>Kalo</h1>
      <p>Deine Karteikarten und dein Lernstand sind mit deinem ChatGPT Konto verbunden.</p>
      <a className="primary button" href={chatGPTSignInPath("/")} target="_top">Mit ChatGPT anmelden</a>
    </main>
  );
  const theme = appearance(preferences.get(appearanceCookie)?.value);
  return <Kalo accountId={user.userId} initialAppearance={theme} initialDesign={selectedDesign} />;
}
