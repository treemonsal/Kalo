import { chatGPTSignInPath, getChatGPTUser } from "./chatgpt-auth";
import Kalo from "./kartenloop";

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
  return <Kalo accountId={user.userId} />;
}
