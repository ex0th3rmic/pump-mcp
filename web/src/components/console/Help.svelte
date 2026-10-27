<script lang="ts">
  import { navigate } from "../../lib/router.svelte";
</script>

<div class="help">
  <section class="help-hero">
    <span class="kicker">help / start here</span>
    <h2>New here? Start with this.</h2>
    <p>Pump MCP gives an AI assistant a safe way to look up pump.fun coin information and prepare transactions. This website lets you see how it works before connecting anything.</p>
    <div class="hero-actions"><button class="primary" onclick={() => navigate("/app/coins")}>Explore a live coin</button><button class="secondary" onclick={() => navigate("/app/playground")}>Try the playground</button></div>
  </section>

  <section class="section">
    <span class="section-number">01</span><h2>Which mode am I using?</h2>
    <p class="lead">Most people should use the demo. You only need operator mode if you run this server or the person who runs it gave you a token.</p>
    <div class="mode-grid">
      <article class="mode demo"><span>for everyone</span><h3>Explore the demo</h3><p>Look around without an account, password, or wallet.</p><ul><li>See one live public coin</li><li>Try clearly labeled sample results</li><li>Learn how trades and launches work</li></ul><b>Nothing you do here can spend money.</b></article>
      <article class="mode"><span>for the server owner</span><h3>Unlock operator tools</h3><p>Use real tools with the server owner’s permission.</p><ul><li>Search any supported coin</li><li>Build real transactions</li><li>Connect your wallet and approve actions</li></ul><b>Real actions require your explicit approval.</b></article>
    </div>
    <div class="plain-note"><b>“Operator” simply means the person running this website’s server.</b><p>A “bearer token” is their password for using its private tools. It is not a signup code, and visitors do not need it.</p></div>
  </section>

  <section class="section">
    <span class="section-number">02</span><h2>How do the pieces fit together?</h2>
    <p class="lead">Think of MCP as a plug socket for AI assistants. It gives an assistant one standard way to connect to tools instead of teaching it a new plug for every service.</p>
    <div class="system-diagram" role="img" aria-label="An AI assistant asks Pump MCP for information. Pump MCP looks up public coin data or builds a transaction using Solana and pump.fun.">
      <div class="system-box"><span>you or your AI app</span><b>Ask a question</b><small>“How is this coin doing?”</small></div>
      <div class="arrow"><i></i><span>asks</span></div>
      <div class="system-box accent"><span>pump-mcp</span><b>The connector</b><small>Finds data and prepares answers</small></div>
      <div class="arrow"><i></i><span>looks up</span></div>
      <div class="system-box"><span>solana + pump.fun</span><b>The source</b><small>Coin data and transactions</small></div>
    </div>
    <p class="caption">The assistant does not need your server passwords. Those stay inside the server.</p>
  </section>

  <section class="section">
    <span class="section-number">03</span><h2>What is a bonding curve?</h2>
    <p class="lead">It is an automatic price rule for a new coin. As more people buy, the coin moves along the curve. “Graduation” means it reaches the end of that early sale phase and moves to a different trading venue.</p>
    <div class="curve-diagram">
      <svg viewBox="0 0 720 210" role="img" aria-labelledby="curve-title curve-desc">
        <title id="curve-title">A bonding curve rising from left to right</title>
        <desc id="curve-desc">The coin starts at the lower left. Its price rises as buyers purchase it. A marker shows its current progress toward graduation at the upper right.</desc>
        <line x1="52" y1="174" x2="680" y2="174" class="axis" /><line x1="52" y1="20" x2="52" y2="174" class="axis" />
        <path d="M55 168 C180 165 275 148 365 118 S535 52 670 26" class="curve-line" />
        <circle cx="395" cy="108" r="8" class="curve-dot" />
        <text x="55" y="196">start</text><text x="592" y="196">graduation</text><text x="410" y="98">you are here</text><text x="12" y="28">price</text>
      </svg>
      <div class="curve-labels"><span><b>Higher on the chart</b> means a higher price.</span><span><b>Further right</b> means closer to graduation.</span></div>
    </div>
  </section>

  <section class="section">
    <span class="section-number">04</span><h2>What happens before a real trade?</h2>
    <p class="lead">Nothing happens in one sudden click. The app shows each step and asks your wallet before anything can move.</p>
    <div class="steps-diagram" role="img" aria-label="Transaction steps: preview the details, test the transaction, approve it in your wallet, then track the result.">
      <div><span>01</span><b>Preview</b><p>See the coin, amount, price, and fees.</p></div><i>→</i>
      <div><span>02</span><b>Simulate</b><p>Practice the exact transaction without spending.</p></div><i>→</i>
      <div><span>03</span><b>Approve</b><p>Your wallet asks you to sign. You can reject.</p></div><i>→</i>
      <div><span>04</span><b>Result</b><p>Track success, failure, or expiry.</p></div>
    </div>
    <div class="safety-note"><b>Your password and wallet keys are different things.</b><p>The bearer token unlocks server tools. Your wallet key signs transactions. Neither should ever be pasted into the other’s place, and this app never asks for your seed phrase.</p></div>
  </section>

  <section class="section">
    <span class="section-number">05</span><h2>Words you might see</h2>
    <div class="glossary">
      <details><summary>MCP</summary><p>A common plug socket for AI apps. It lets an assistant use tools such as coin lookup in a standard way.</p></details>
      <details><summary>Operator</summary><p>The person or team running this deployment. They decide who can use its private tools.</p></details>
      <details><summary>Bearer token</summary><p>A password for those private tools. Keep it secret. You do not need it for the public demo.</p></details>
      <details><summary>Wallet</summary><p>An app such as a Solana browser wallet that holds your keys and asks before you sign a transaction.</p></details>
      <details><summary>Unsigned transaction</summary><p>A prepared set of instructions that cannot do anything until your wallet approves it.</p></details>
      <details><summary>RPC</summary><p>The server’s way of asking Solana for information or sending a signed transaction. You do not need to configure it just to browse.</p></details>
      <details><summary>Code Mode</summary><p>A safe, small workspace where the AI’s JavaScript runs without direct access to server passwords or the open internet.</p></details>
      <details><summary>Mainnet and devnet</summary><p>Mainnet uses real assets. Devnet is a practice network with test assets. Always check the network shown in the app.</p></details>
    </div>
  </section>

  <section class="section faq">
    <span class="section-number">06</span><h2>Common questions</h2>
    <details><summary>Do I need to pay or connect a wallet to look around?</summary><p>No. The demo is free to browse and does not need a wallet.</p></details>
    <details><summary>Can the demo spend my money?</summary><p>No. Demo trade and launch screens are read-only samples. They cannot build, sign, or send transactions.</p></details>
    <details><summary>Where do I get an operator token?</summary><p>Only from the person running this server. There is no public signup. Do not ask for or share someone else’s token.</p></details>
    <details><summary>Is this the official pump.fun website?</summary><p>No. Pump MCP is an independent open-source project that uses pump.fun data and its official SDK. It is not affiliated with pump.fun.</p></details>
    <details><summary>Where can I read the technical documentation?</summary><p>The <a href="https://github.com/ex0th3rmic/pump-mcp#readme" target="_blank" rel="noopener">README on GitHub</a> covers deployment, configuration, security, and every route.</p></details>
  </section>

  <section class="help-footer"><div><b>Ready to look around?</b><p>Start with the live public coin, then try a sample question.</p></div><button class="primary" onclick={() => navigate("/app/coins")}>Show me a coin</button></section>
</div>

<style>
  .help { max-width: 1040px; }
  .help-hero { padding: 30px; border: 1px solid rgba(25,195,125,.25); border-radius: 10px; background: linear-gradient(135deg,var(--ac-bg),var(--s1) 65%); }
  .kicker { color: var(--ac); font: 10px var(--mono); text-transform: uppercase; letter-spacing: .12em; }
  .help-hero h2 { margin: 8px 0 10px; font-size: 30px; letter-spacing: -.035em; }
  .help-hero p { max-width: 68ch; margin: 0; color: var(--t2); line-height: 1.65; }
  .hero-actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 22px; }
  button { font-size: 12px; }
  .primary, .secondary { padding: 10px 15px; border-radius: 6px; font-weight: 600; }
  .primary { background: var(--ac); color: var(--ac-ink); }
  .secondary { border: 1px solid var(--b2); background: var(--s2); color: var(--t); }
  .section { position: relative; margin-top: 18px; padding: 26px; border: 1px solid var(--b); border-radius: 9px; background: var(--s1); }
  .section-number { position: absolute; right: 24px; top: 26px; color: var(--t3); font: 10px var(--mono); }
  .section h2 { margin: 0 40px 8px 0; font-size: 21px; letter-spacing: -.02em; }
  .lead { max-width: 78ch; margin: 0 0 20px; color: var(--t2); font-size: 13px; line-height: 1.65; }
  .mode-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .mode { padding: 18px; border: 1px solid var(--b); border-radius: 8px; background: var(--bg); }
  .mode.demo { border-color: rgba(25,195,125,.28); }
  .mode > span { color: var(--t3); font: 9px var(--mono); text-transform: uppercase; letter-spacing: .1em; }
  .mode h3 { margin: 6px 0 8px; font-size: 17px; }
  .mode p, .mode li { color: var(--t2); font-size: 12px; line-height: 1.6; }
  .mode ul { padding-left: 18px; }
  .mode b { color: var(--ac); font-size: 11px; }
  .plain-note, .safety-note { margin-top: 14px; padding: 14px; border-left: 2px solid var(--ac); background: var(--ac-bg); }
  .plain-note b, .safety-note b { color: var(--t); font-size: 12px; }
  .plain-note p, .safety-note p { margin: 5px 0 0; color: var(--t2); font-size: 12px; line-height: 1.55; }
  .system-diagram { display: grid; grid-template-columns: 1fr auto 1fr auto 1fr; align-items: center; gap: 10px; padding: 24px 14px; border: 1px solid var(--b); border-radius: 8px; background: var(--bg); }
  .system-box { min-width: 0; text-align: center; }
  .system-box span { display: block; color: var(--t3); font: 9px var(--mono); text-transform: uppercase; }
  .system-box b { display: block; margin: 7px 0; color: var(--t); font-size: 14px; }
  .system-box small { display: block; color: var(--t2); font-size: 10px; }
  .system-box.accent b { color: var(--ac); }
  .arrow { align-self: center; color: var(--t3); font: 9px var(--mono); text-align: center; }
  .arrow i { display: block; width: 34px; height: 1px; margin-bottom: 5px; background: var(--ac); position: relative; }
  .arrow i::after { content: ""; position: absolute; right: 0; top: -3px; border-left: 5px solid var(--ac); border-top: 3px solid transparent; border-bottom: 3px solid transparent; }
  .caption { margin: 10px 0 0; color: var(--t3); font-size: 11px; text-align: center; }
  .curve-diagram { padding: 12px; border: 1px solid var(--b); border-radius: 8px; background: var(--bg); }
  svg { display: block; width: 100%; height: auto; }
  .axis { stroke: var(--b2); stroke-width: 1; } .curve-line { fill: none; stroke: var(--ac); stroke-width: 4; } .curve-dot { fill: var(--bg); stroke: var(--ac); stroke-width: 4; }
  svg text { fill: var(--t3); font: 11px var(--mono); }
  .curve-labels { display: flex; flex-wrap: wrap; gap: 24px; padding: 0 10px 8px; color: var(--t3); font-size: 11px; } .curve-labels b { color: var(--t2); }
  .steps-diagram { display: grid; grid-template-columns: 1fr auto 1fr auto 1fr auto 1fr; gap: 10px; align-items: center; }
  .steps-diagram > div { min-width: 0; min-height: 130px; padding: 14px; border: 1px solid var(--b); border-radius: 7px; background: var(--bg); }
  .steps-diagram > div > span { color: var(--ac); font: 9px var(--mono); }
  .steps-diagram b { display: block; margin: 6px 0; font-size: 14px; }
  .steps-diagram p { margin: 0; color: var(--t3); font-size: 11px; line-height: 1.5; }
  .steps-diagram > i { color: var(--ac); font-style: normal; }
  .glossary { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  details { padding: 12px 14px; border: 1px solid var(--b); border-radius: 6px; background: var(--bg); }
  summary { color: var(--t); cursor: pointer; font-size: 12px; font-weight: 600; }
  details p { margin: 8px 0 0; color: var(--t2); font-size: 12px; line-height: 1.6; }
  details a { color: var(--ac); }
  .faq details { margin-top: 8px; }
  .help-footer { display: flex; justify-content: space-between; align-items: center; gap: 16px; margin-top: 18px; padding: 22px 26px; border: 1px solid rgba(25,195,125,.25); border-radius: 9px; background: var(--ac-bg); }
  .help-footer b { color: var(--ac); } .help-footer p { margin: 5px 0 0; color: var(--t2); font-size: 12px; }
  @media (max-width: 800px) {
    .system-diagram { grid-template-columns: 1fr; gap: 14px; }
    .arrow i { width: 1px; height: 22px; margin: 0 auto 5px; }
    .arrow i::after { right: -3px; top: auto; bottom: 0; border-left: 3px solid transparent; border-right: 3px solid transparent; border-top: 5px solid var(--ac); border-bottom: 0; }
    .steps-diagram { grid-template-columns: 1fr; }
    .steps-diagram > div { min-height: 0; }
    .steps-diagram > i { transform: rotate(90deg); text-align: center; }
  }
  @media (max-width: 620px) {
    .help-hero, .section { padding: 20px; }
    .help-hero h2 { font-size: 26px; }
    .mode-grid, .glossary { grid-template-columns: 1fr; }
    .curve-labels { gap: 8px; }
    .help-footer { align-items: flex-start; flex-direction: column; }
  }
</style>
