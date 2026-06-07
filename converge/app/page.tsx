import { Canvas } from './components/Canvas';
import { PromptInput } from './components/PromptInput';
import { FullscreenButton } from './components/FullscreenButton';

export default function Home() {
  return (
    <main className="app-shell">
      <Canvas />
      <PromptInput />
      <FullscreenButton />
    </main>
  );
}
