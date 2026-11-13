/* 文游工坊 SillyTavern adapter · MIT */
const EXT_URL = new URL('./', import.meta.url);
const VERSION = '1.4.0';
let dialog, frame, bridgeToken, status, retry, closeButton;
let ready = false, loading = false, inFlight = false, loadNumber = 0, activeGeneration = null;
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

// Only names/IDs cross into the game. Connection settings and preset secrets stay here.
function getCatalog(context) {
    const power = context?.powerUserSettings;
    const manager = context?.getPresetManager?.();
    return {
        personas: power ? [{ id: '@current', name: `当前用户 · ${context.name1 || '未命名'}` },
            ...Object.entries(power.personas || {}).map(([id, name]) => ({ id, name: String(name || id) }))] : [],
        presets: manager?.getAllPresets?.() || [],
        api: context?.mainApi || '', currentPreset: manager?.getSelectedPresetName?.() || '',
        personaSupport: Boolean(power), presetSupport: Boolean(manager),
    };
}
function readPersona(context, id) {
    const power = context?.powerUserSettings;
    if (!power) throw Error('此酒馆未提供用户人设接口，请更新酒馆或改用手动人设。');
    if (id !== '@current' && !Object.hasOwn(power.personas || {}, id)) {
        throw Error('该酒馆人设已删除，请刷新列表重新选择。');
    }
    const name = id === '@current' ? context.name1 : power.personas[id];
    const description = id === '@current' ? power.persona_description : power.persona_descriptions?.[id]?.description;
    if (String(description || '').length > 20000) throw Error('该人设超过 20,000 字符，请先在酒馆精简，或使用手动人设。');
    return { id, name: String(name || '未命名'), description: String(description || '') };
}
async function usePreset(context, selected) {
    if (!selected?.name) return context;
    if (selected.api !== context.mainApi) throw Error('存档预设属于另一种 API。请在工坊或存档中重新选择预设。');
    const manager = context.getPresetManager?.();
    if (!manager?.getAllPresets?.().includes(selected.name)) throw Error('所选酒馆预设已不存在，请刷新列表重新选择。');
    // This is an explicit native selection, not a temporary switch that would
    // overwrite unsaved sampler changes when restoring an old preset later.
    if (manager.getSelectedPresetName() !== selected.name) {
        const value = manager.findPreset(selected.name);
        if (value === undefined || value === null) throw Error('无法定位该酒馆预设，请刷新列表。');
        await manager.selectPreset(value);
    }
    const fresh = globalThis.SillyTavern.getContext();
    if (fresh.mainApi !== selected.api || fresh.getPresetManager?.()?.getSelectedPresetName?.() !== selected.name) {
        throw Error('酒馆未能应用所选预设，请检查连接后重试。');
    }
    return fresh;
}
function presetPrompt(context, data) {
    if (context.mainApi !== 'openai') return data.prompt;
    const settings = context.chatCompletionSettings;
    if (!Array.isArray(settings?.prompts)) return data.prompt;
    const orders = settings.prompt_order || [];
    const order = orders.find(x => Number(x.character_id) === 100001) ||
        orders.find(x => String(x.character_id) === String(context.characterId)) ||
        orders.find(x => Number(x.character_id) === 100000);
    if (!Array.isArray(order?.order)) return data.prompt;
    const blocks = new Map(settings.prompts.map(x => [x.identifier, x]));
    const messages = [], depthBlocks = [];
    const replace = text => String(text || '').replace(/{{(user|char|persona|description|personality|scenario|mesExamples|original)}}/gi,
        (_, key) => ({ user: data.player || '玩家', char: '文游叙述者', persona: data.persona || '',
            description: '', personality: '', scenario: '', mesexamples: '', original: data.systemPrompt })[key.toLowerCase()] || '');
    let gameAdded = false;
    for (const entry of order.order) {
        if (!entry.enabled) continue;
        const block = blocks.get(entry.identifier);
        if (!block) continue;
        if (block.marker) {
            // Game state replaces chat history. Character cards, other chats,
            // and their world books are not loaded into this separate game.
            if (entry.identifier === 'chatHistory' && !gameAdded) {
                messages.push({ role: 'user', content: data.prompt }); gameAdded = true;
            }
            continue;
        }
        const content = replace(block.content);
        if (!content.trim()) continue;
        const message = { role: ['system', 'user', 'assistant'].includes(block.role) ? block.role : 'system', content };
        if (Number(block.injection_position) === 1) depthBlocks.push({ message, depth: Math.max(0, Number(block.injection_depth) || 0) });
        else messages.push(message);
    }
    if (!gameAdded) messages.push({ role: 'user', content: data.prompt });
    for (const { message, depth } of depthBlocks) messages.splice(Math.max(0, messages.length - depth), 0, message);
    messages.push({ role: 'user', content: '本次为文游工坊的独立游戏请求。沿用上述预设的文风，但输出必须遵守游戏引擎的完整 JSON 结构与五个行动选项，不附加格式外文字。' });
    if (messages.reduce((sum, x) => sum + x.content.length, 0) > 100000) {
        throw Error('预设与剧情合计超过 100,000 字符，请精简预设或人设后重试。');
    }
    return messages;
}

// Uses native Tavern payload conversion so credentials never enter the game frame.
function generationError(error) {
    const raw = String(error?.message || error?.error?.message || error?.statusText || error || '模型生成失败。');
    const code = Number(error?.status || error?.response?.status || raw.match(/(?:status|HTTP|code|错误)?\s*(524|503|502|504|429)\b/i)?.[1]) || 0;
    if (code === 524 || code === 504) return { code, error: `模型上游响应超时（${code}）。本次设定和进度已保留。可用「精简后重试」减少等待；若仍失败，请在酒馆更换模型或连接。` };
    if ([503, 502].includes(code) || /service unavailable|bad gateway/i.test(raw)) return { code: code || 503, error: `酒馆模型服务暂时不可用（${code || 503}）。设定和进度已保留；稍后重试，或在酒馆切换可用的模型连接。` };
    if (code === 429) return { code, error: '模型服务请求过多或额度受限（429）。请稍后重试，并检查酒馆模型的额度。' };
    if (error?.name === 'AbortError') return { code: 0, error: '本次生成已停止或超时，设定和进度未改变。可以重新尝试。' };
    return { code, error: raw };
}
async function generateGame(context, data, controller, progress) {
    const prompt = presetPrompt(context, data), service = context.ChatCompletionService;
    const responseLength = data.compact ? 1800 : 2600;
    if (!data.compatibility && context.mainApi === 'openai' && typeof service?.presetToGeneratePayload === 'function' &&
        typeof service?.sendRequest === 'function' && typeof context.getChatCompletionModel === 'function') {
        const source = Array.isArray(prompt) ? prompt : [{ role: 'user', content: prompt }];
        const messages = [{ role: 'system', content: data.systemPrompt }, ...source].map(message => ({
            ...message, content: typeof context.substituteParams === 'function' ? context.substituteParams(message.content) : message.content,
        }));
        const payload = await service.presetToGeneratePayload({}, {}, {
            messages, model: context.getChatCompletionModel(), stream: true, n: 1,
        });
        // Some native providers convert the budget to max_completion_tokens.
        // Do not reintroduce max_tokens after that conversion or send both keys.
        if (Object.hasOwn(payload, 'max_completion_tokens')) {
            payload.max_completion_tokens = Math.max(4096, responseLength);
            delete payload.max_tokens;
        } else payload.max_tokens = responseLength;
        controller.signal.throwIfAborted();
        progress('已提交生成请求，正在等待模型开始回复…');
        const result = await service.sendRequest(payload, true, controller.signal);
        if (typeof result !== 'function') {
            if (typeof result?.content === 'string') return result.content;
            throw Error('酒馆流式接口返回格式不兼容。请更新酒馆，或使用兼容请求模式。');
        }
        let text = '', lastUpdate = 0;
        for await (const chunk of result()) {
            controller.signal.throwIfAborted();
            if (typeof chunk?.text === 'string') text = chunk.text;
            if (text.length > 100000) throw Error('模型回复超过限制，请缩短预设和回复篇幅。');
            if (Date.now() - lastUpdate > 600) {
                progress(text ? `正在接收剧情…已收到 ${text.length.toLocaleString()} 字符` : '模型正在处理请求，请稍候…');
                lastUpdate = Date.now();
            }
        }
        return text;
    }
    // Older/forked Tavern hosts retain their existing adapter and provider routing.
    // A failed request is never silently sent a second time through another path.
    if (typeof context.generateRaw !== 'function') throw Error('当前酒馆缺少可用的生成接口，请更新酒馆。');
    progress('酒馆正在生成剧情，请稍候…');
    return context.generateRaw({ prompt, systemPrompt: data.systemPrompt, responseLength });
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
        try { send({ type: 'wenyou:catalog', catalog: getCatalog(globalThis.SillyTavern?.getContext?.()) }); }
        catch { send({ type: 'wenyou:catalog', catalog: { error: '无法读取酒馆列表，可点击刷新重试。' } }); }
        return;
    }
    if (!ready || !dialog.open) return;
    if (data.type === 'wenyou:catalog' || data.type === 'wenyou:persona') {
        try {
            const context = globalThis.SillyTavern?.getContext?.();
            if (data.type === 'wenyou:catalog') send({ type: 'wenyou:catalog', catalog: getCatalog(context) });
            else if (typeof data.id === 'string' && typeof data.personaId === 'string') {
                send({ type: 'wenyou:persona-result', id: data.id, persona: readPersona(context, data.personaId) });
            }
        } catch (error) {
            if (data.type === 'wenyou:persona') send({ type: 'wenyou:persona-result', id: data.id, error: error.message });
            else send({ type: 'wenyou:catalog', catalog: { error: error.message } });
        }
        return;
    }
    if (data.type === 'wenyou:cancel') {
        if (activeGeneration?.id === data.id && activeGeneration.token === bridgeToken) activeGeneration.controller.abort();
        return;
    }
    if (data.type !== 'wenyou:generate') return;
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
    const controller = new AbortController();
    activeGeneration = { id: data.id, token: requestToken, controller };
    const deadline = setTimeout(() => controller.abort(), 240000);
    try {
        let context = globalThis.SillyTavern?.getContext?.();
        if (!context) {
            throw Error('当前酒馆不支持 generateRaw 对象参数接口，请更新至近期官方版本。');
        }
        context = await usePreset(context, data.preset);
        const result = await generateGame(context, data, controller, message => respond({ type: 'wenyou:progress', id: data.id, message }));
        if (typeof result !== 'string' || !result.trim()) {
            throw Error('模型没有返回剧情正文。请检查酒馆连接；若模型启用了长思考，可降低思考强度或换用响应更快的模型。');
        }
        respond({ type: 'wenyou:result', id: data.id, text: result });
    } catch (error) {
        respond({ type: 'wenyou:result', id: data.id, ...generationError(error) });
    } finally {
        clearTimeout(deadline);
        activeGeneration = null;
        inFlight = false;
    }
}

window.addEventListener('message', receive);
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
else mount();
