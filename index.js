/* 文游工坊 SillyTavern adapter · MIT */
const EXT_URL = new URL('./', import.meta.url);
const VERSION = '1.1.0';
let dialog, frame, bridgeToken, status, retry, closeButton;
let ready = false, loading = false, inFlight = false, loadNumber = 0;
let timer, templatePromise, previousFocus, scrollStyles;

// A shadow root isolates the modal from tavern themes and stale host styles.
const MODAL_CSS = `
 :host { all: initial; }
 dialog {
   box-sizing: border-box; position: fixed; inset: 0; margin: 0;
   width: 100vw; height: 100vh; height: 100dvh;
   max-width: none; max-height: none; padding: 0; border: 0;
   background: #edf1e9; color: #253b39; overflow: hidden;
   font: 14px/1.5 system-ui, sans-serif; display: none;
   overscroll-behavior: none; color-scheme: light;
 }
 dialog[open] { display: flex; flex-direction: column; }
 dialog::backdrop { background: #edf1e9; }
 .bar {
   flex: 0 0 auto; display: flex; align-items: center;
   justify-content: space-between; gap: 12px; box-sizing: border-box;
   min-height: 54px; padding: 8px 15px;
   padding-top: max(8px, env(safe-area-inset-top));
   background: #fffef9; border-bottom: 1px solid #dce5da;
 }
 button {
   box-sizing: border-box; font: inherit; color: #253b39;
   background: #e9f1e9; border: 1px solid #cfdaca;
   border-radius: 9px; padding: 9px 12px; cursor: pointer;
   min-height: 42px; white-space: nowrap; touch-action: manipulation;
 }
 button:focus-visible { outline: 3px solid #dfb17f; outline-offset: -3px; }
 .view { flex: 1 1 0; position: relative; min-height: 0; width: 100%; overflow: hidden; }
 iframe { position: absolute; inset: 0; display: block; width: 100%; height: 100%; border: 0; background: #edf1e9; }
 .status {
   position: absolute; inset: 0; display: flex; flex-direction: column;
   align-items: center; justify-content: center; padding: 24px;
   box-sizing: border-box; text-align: center; background: #edf1e9;
 }
 .status p { max-width: 420px; white-space: pre-wrap; overflow-wrap: anywhere; }
 [hidden] { display: none !important; }
`;

function mount() {
    if (document.getElementById('wenyou-forge-launch')) return;
    const box = document.createElement('div');
    box.id = 'wenyou-forge-launch';
    box.className = 'extension_container';
    const title = document.createElement('b');
    title.textContent = '文游工坊';
    const description = document.createElement('p');
    description.textContent = '上传资料，开启手机端互动文游。';
    description.style.fontSize = '12px';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'menu_button';
    button.textContent = '❀ 打开文游工坊';
    // Also works when an older host.css remains in the browser cache.
    button.style.setProperty('width', 'fit-content', 'important');
    button.style.setProperty('max-width', '100%', 'important');
    button.style.setProperty('white-space', 'nowrap', 'important');
    button.addEventListener('click', open);
    box.append(title, description, button);
    (document.querySelector('#extensions_settings2') ||
        document.querySelector('#extensions_settings') || document.body).append(box);
}

function createModal() {
    const host = document.createElement('div');
    host.id = 'wenyou-forge-host';
    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = MODAL_CSS;
    dialog = document.createElement('dialog');
    dialog.setAttribute('aria-label', '文游工坊');
    const bar = document.createElement('div');
    bar.className = 'bar';
    const title = document.createElement('span');
    title.textContent = '文游工坊';
    closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.textContent = '返回酒馆 ×';
    closeButton.addEventListener('click', () => dialog.close());
    bar.append(title, closeButton);
    const view = document.createElement('div');
    view.className = 'view';
    frame = document.createElement('iframe');
    frame.title = '文游工坊互动页面';
    frame.hidden = true;
    status = document.createElement('div');
    status.className = 'status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    status.append(document.createElement('p'));
    retry = document.createElement('button');
    retry.type = 'button';
    retry.textContent = '重新加载工坊';
    retry.hidden = true;
    retry.addEventListener('click', loadApp);
    status.append(retry);
    view.append(frame, status);
    dialog.append(bar, view);
    shadow.append(style, dialog);
    document.body.append(host);
    dialog.addEventListener('close', () => {
        if (scrollStyles) {
            for (const [element, value, priority] of scrollStyles) {
                if (value) element.style.setProperty('overflow', value, priority);
                else element.style.removeProperty('overflow');
            }
            scrollStyles = undefined;
        }
        if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    });
}

function open() {
    if (typeof HTMLDialogElement === 'undefined' ||
        typeof HTMLDialogElement.prototype.showModal !== 'function') {
        alert('此浏览器不支持工坊全屏窗口，请更新浏览器后重试。');
        return;
    }
    if (!dialog) createModal();
    if (dialog.open) return;
    previousFocus = document.activeElement;
    // Native top-layer modal semantics make the background document inert.
    dialog.showModal();
    scrollStyles = [document.documentElement, document.body].map(element => {
        const saved = [element, element.style.getPropertyValue('overflow'),
            element.style.getPropertyPriority('overflow')];
        element.style.setProperty('overflow', 'hidden', 'important');
        return saved;
    });
    closeButton.focus();
    if (!ready && !loading) loadApp();
}

function showError(message) {
    clearTimeout(timer);
    loading = false;
    ready = false;
    frame.hidden = true;
    status.hidden = false;
    status.firstElementChild.textContent = message;
    retry.hidden = false;
}

async function loadApp() {
    const number = ++loadNumber;
    clearTimeout(timer);
    ready = false;
    loading = true;
    bridgeToken = crypto.randomUUID();
    frame.hidden = true;
    status.hidden = false;
    retry.hidden = true;
    status.firstElementChild.textContent = '正在打开文游工坊…';
    timer = setTimeout(() => {
        if (number === loadNumber) showError('工坊页面加载超时。请检查网络后重试；若仍失败，请更新扩展并刷新酒馆。');
    }, 30000);
    try {
        // Cloud hosts may rewrite extension HTML requests to the tavern home
        // page. Load the trusted page as a JS asset, then render via srcdoc.
        if (!templatePromise) {
            const url = new URL('app-content.js', EXT_URL);
            url.searchParams.set('v', VERSION);
            url.searchParams.set('attempt', String(number));
            templatePromise = import(url.href).then(module => {
                if (typeof module.default !== 'string' ||
                    !module.default.includes('data-wenyou-app="1"')) {
                    throw Error('工坊页面文件不完整，请重新更新扩展。');
                }
                return module.default;
            }).catch(error => { templatePromise = undefined; throw error; });
        }
        const template = await templatePromise;
        if (number !== loadNumber || !loading) return;
        const base = document.createElement('base');
        base.href = EXT_URL.href;
        base.setAttribute('data-wenyou-host', '');
        const config = document.createElement('meta');
        config.name = 'wenyou-bridge';
        config.content = JSON.stringify({ token: bridgeToken, origin: location.origin });
        // Only trusted extension HTML is inserted here. Source/model text is
        // still rendered by the app using textContent, never as executable HTML.
        frame.srcdoc = template.replace('<head>', () => '<head>' + base.outerHTML + config.outerHTML);
    } catch (error) {
        if (number !== loadNumber) return;
        showError('无法载入工坊文件。请更新扩展后刷新酒馆，再点击重试。\n' +
            (error?.message || '页面加载失败。'));
    }
}

async function receive(event) {
    if (!frame || event.source !== frame.contentWindow ||
        event.origin !== location.origin || event.data?.token !== bridgeToken) return;
    const data = event.data;
    const send = payload => frame.contentWindow.postMessage({ ...payload, token: bridgeToken }, location.origin);
    if (data.type === 'wenyou:ready') {
        if (!loading && !ready) return;
        clearTimeout(timer);
        loading = false;
        ready = true;
        status.hidden = true;
        frame.hidden = false;
        send({ type: 'wenyou:connected' });
        return;
    }
    if (!ready || !dialog.open || data.type !== 'wenyou:generate') return;
    if (typeof data.id !== 'string' || typeof data.prompt !== 'string' ||
        data.prompt.length > 50000 || typeof data.systemPrompt !== 'string' ||
        data.systemPrompt.length > 5000) return;
    if (inFlight) {
        send({ type: 'wenyou:result', id: data.id, error: '上一条生成尚未结束，请稍后再试。' });
        return;
    }
    inFlight = true;
    const requestToken = bridgeToken;
    const respond = payload => { if (requestToken === bridgeToken) send(payload); };
    try {
        const context = globalThis.SillyTavern?.getContext?.();
        if (typeof context?.generateRaw !== 'function') {
            throw Error('当前酒馆不支持 generateRaw 对象参数接口，请更新至近期官方版本。');
        }
        const result = await context.generateRaw({
            prompt: data.prompt, systemPrompt: data.systemPrompt, responseLength: 4000,
        });
        if (typeof result !== 'string' || !result.trim()) {
            throw Error('模型返回为空。请检查酒馆 API 连接与最大回复长度。');
        }
        respond({ type: 'wenyou:result', id: data.id, text: result });
    } catch (error) {
        respond({ type: 'wenyou:result', id: data.id, error: error?.message || '模型生成失败。请检查酒馆连接。' });
    } finally {
        inFlight = false;
    }
}

window.addEventListener('message', receive);
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
else mount();
