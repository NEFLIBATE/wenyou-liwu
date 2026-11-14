/* 文游工坊 SillyTavern adapter · MIT */
const EXT_URL = new URL('./', import.meta.url);
const VERSION = '1.5.0';
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
const REQUEST_LIMITS = { prepare: 15000, headers: 45000, firstByte: 30000, idle: 30000, quickTotal: 90000, fullTotal: 150000, probeTotal: 30000 };
function requestFault(kind, message) { return Object.assign(new Error(message), { name: 'GenerationTimeout', kind }); }
function abortReason(signal) { return signal.reason instanceof Error ? signal.reason : new DOMException('已取消生成', 'AbortError'); }
function waitRequest(promise, controller, ms = 0, fault = null) {
    return new Promise((resolve, reject) => {
        let timer;
        const stop = () => { clearTimeout(timer); controller.signal.removeEventListener('abort', aborted); };
        const aborted = () => { stop(); reject(abortReason(controller.signal)); };
        if (controller.signal.aborted) { reject(abortReason(controller.signal)); return; }
        controller.signal.addEventListener('abort', aborted, { once: true });
        if (ms) timer = setTimeout(() => controller.abort(fault), ms);
        Promise.resolve(promise).then(value => { stop(); resolve(value); }, error => { stop(); reject(error); });
    });
}
function contentText(value) {
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.filter(x => !x?.thought && x?.type !== 'thinking').map(x => typeof x === 'string' ? x : typeof x?.text === 'string' ? x.text : '').join('');
    return '';
}
function replyPart(data) {
    if (data?.error) throw Object.assign(new Error(typeof data.error?.message === 'string' ? data.error.message : '模型接口返回错误响应。'), { status: data.error?.status || data.error?.code });
    const choice = data?.choices?.find?.(x => !x.index) || data?.choices?.[0];
    if (choice) return { text: contentText(choice.delta?.content ?? choice.message?.content ?? choice.text), replace: !choice.delta, done: Boolean(choice.finish_reason), thinking: Boolean(choice.delta?.reasoning_content || choice.delta?.reasoning || choice.message?.reasoning_content) };
    const parts = data?.candidates?.[0]?.content?.parts;
    if (Array.isArray(parts)) return { text: contentText(parts), thinking: parts.some(x => x.thought), done: Boolean(data.candidates[0].finishReason) };
    if (data?.type === 'content_block_delta') return { text: data.delta?.type === 'thinking_delta' ? '' : contentText(data.delta?.text), thinking: data.delta?.type === 'thinking_delta' };
    if (data?.type === 'message_stop') return { text: '', done: true };
    if (data?.delta?.message?.content?.text) return { text: data.delta.message.content.text };
    if (data?.type === 'response.output_text.delta') return { text: contentText(data.delta) };
    return { text: contentText(data?.content ?? data?.text ?? data?.response ?? data?.message?.content), replace: true, done: data?.done === true };
}
async function readModelResponse(response, controller, diagnostics, report, limits = REQUEST_LIMITS) {
    diagnostics.httpStatus = response.status;
    const mime = response.headers.get('content-type') || '';
    diagnostics.contentType = mime.split(';')[0].slice(0, 60);
    diagnostics.stage = 'headers'; report(`酒馆已响应 HTTP ${response.status}，正在读取正文…`);
    if (!response.ok) { void response.body?.cancel().catch(() => {}); throw Object.assign(new Error(`HTTP ${response.status}`), { status: response.status }); }
    if (!response.body) throw Error('酒馆返回了空响应体。');
    const reader = response.body.getReader(), decoder = new TextDecoder();
    let buffer = '', text = '', bytes = 0, packets = 0, done = false, lastReport = 0;
    let format = /ndjson/i.test(mime) ? 'ndjson' : /event-stream/i.test(mime) ? 'sse' : /json/i.test(mime) ? 'json' : 'detect';
    function accept(packet) {
        if (Array.isArray(packet)) { for (const item of packet) accept(item); return; }
        packets++; diagnostics.packets = packets;
        const part = replyPart(packet);
        if (part.text) { text = part.replace ? part.text : text + part.text; diagnostics.outputChars = text.length; diagnostics.stage = 'text'; }
        else if (part.thinking) diagnostics.stage = 'thinking';
        if (part.done) done = true;
        if (text.length > 100000) throw Error('模型回复超过 100,000 字符，请缩短回复。');
    }
    function parseEvent(event) {
        const payload = event.split(/\r?\n|\r/).filter(line => line.startsWith('data:')).map(line => line.slice(5).replace(/^ /, '')).join('\n').trim();
        if (!payload) return;
        if (payload === '[DONE]') { done = true; return; }
        try { accept(JSON.parse(payload)); } catch (error) { if (error instanceof SyntaxError) throw Error('模型流中的 data 不是有效 JSON；请查看诊断并尝试兼容模式。'); throw error; }
    }
    function consume(final = false) {
        const trimmed = buffer.trimStart();
        if (format === 'detect') {
            if (/^(?:data:|event:|:)/.test(trimmed)) format = 'sse';
            else if (/^[{[]/.test(trimmed)) format = 'json';
            else if (trimmed.startsWith('<')) throw Error('酒馆返回了 HTML 页面，而非模型响应。请检查连接或使用兼容模式。');
            else if (final && trimmed) throw Error('模型接口返回了不支持的响应格式。');
        }
        if (trimmed.startsWith('<')) throw Error('酒馆返回 HTML 页面而非模型数据，请检查连接或使用兼容模式。');
        if (packets === 0 && /^(?:data:|event:|:)/.test(trimmed)) format = 'sse';
        // Some proxy hosts advertise SSE but return one buffered JSON response.
        if (format === 'sse' && packets === 0 && /^[{[]/.test(trimmed)) format = 'json';
        diagnostics.format = format;
        if (format === 'json') {
            let packet; try { packet = JSON.parse(buffer); } catch (error) { if (final) throw Error('模型 JSON 响应中断或不完整。'); return; }
            accept(packet); buffer = ''; done = true;
        } else if (format === 'sse') {
            let match;
            while (!done && (match = /\r\n\r\n|\n\n|\r\r/.exec(buffer))) {
                const event = buffer.slice(0, match.index); buffer = buffer.slice(match.index + match[0].length); parseEvent(event);
            }
            if (final && !done && buffer.trim()) { parseEvent(buffer); buffer = ''; }
        } else if (format === 'ndjson') {
            let at; while (!done && (at = buffer.indexOf('\n')) >= 0) { const line = buffer.slice(0, at).trim(); buffer = buffer.slice(at + 1); if (line) accept(JSON.parse(line)); }
            if (final && buffer.trim()) { accept(JSON.parse(buffer)); buffer = ''; }
        }
    }
    try {
        while (!done) {
            const next = await waitRequest(reader.read(), controller, bytes ? limits.idle : limits.firstByte,
                requestFault(bytes ? 'stream-idle' : 'no-body', bytes ? '模型数据流已停顿 30 秒；未提交部分剧情。' : '酒馆已返回响应头，但 30 秒内没有正文数据。'));
            if (next.done) { buffer += decoder.decode(); consume(true); break; }
            bytes += next.value.byteLength; diagnostics.bytes = bytes;
            if (!diagnostics.firstByteMs) diagnostics.firstByteMs = Date.now() - diagnostics.started;
            if (diagnostics.stage === 'headers') diagnostics.stage = 'body';
            buffer += decoder.decode(next.value, { stream: true });
            if (buffer.length > 1500000) throw Error('模型响应数据过大，已停止读取。');
            consume();
            if (Date.now() - lastReport > 500) {
                report(text ? `正在接收剧情…已收到 ${text.length.toLocaleString()} 字符` : diagnostics.stage === 'thinking' ? '模型连接正常，正在思考，尚未返回剧情正文…' : `已收到 ${bytes.toLocaleString()} 字节，等待可用正文…`);
                lastReport = Date.now();
            }
        }
        if (!text.trim()) throw Error('接口已返回数据，但没有可用剧情正文。可查看诊断，并尝试连接测试或兼容模式。');
        return text;
    } finally { void reader.cancel().catch(() => {}); try { reader.releaseLock(); } catch {} }
}
async function generateGame(context, data, controller, progress, diagnostics = {}, task = {}, limits = REQUEST_LIMITS) {
    const quick = data.generationMode === 'quick' || data.test === true;
    const prompt = quick ? data.prompt : presetPrompt(context, data), service = context.ChatCompletionService;
    const responseLength = data.test ? 256 : quick ? 1400 : data.compact ? 1800 : 2600;
    diagnostics.started = Date.now(); diagnostics.mode = data.test ? 'probe' : quick ? 'quick' : 'full';
    diagnostics.stage = 'prepare'; diagnostics.inputChars = data.prompt.length; diagnostics.bytes = 0; diagnostics.outputChars = 0;
    const totalTimer = setTimeout(() => controller.abort(requestFault('total', `本次${data.test ? '连接测试' : '生成'}已达到时限；阶段：${diagnostics.stage}，收到 ${diagnostics.bytes ?? '未知'} 字节、${diagnostics.outputChars || 0} 字正文。进度未改变。`)), data.test ? limits.probeTotal : quick ? limits.quickTotal : limits.fullTotal);
    const report = message => { diagnostics.elapsedMs = Date.now() - diagnostics.started; progress(message); };
    try {
        if (!data.compatibility && context.mainApi === 'openai' && typeof service?.presetToGeneratePayload === 'function' && typeof context.getChatCompletionModel === 'function') {
            const source = Array.isArray(prompt) ? prompt : [{ role: 'user', content: prompt }];
            const messages = [{ role: 'system', content: data.systemPrompt }, ...source].map(message => ({ ...message, content: !quick && typeof context.substituteParams === 'function' ? context.substituteParams(message.content) : message.content }));
            const payload = await waitRequest(service.presetToGeneratePayload({}, {}, { messages, model: context.getChatCompletionModel(), stream: true, n: 1 }), controller, limits.prepare, requestFault('prepare', '酒馆准备请求超时。请检查当前预设或连接配置。'));
            if (quick) {
                if (payload.reasoning_effort != null && payload.reasoning_effort !== 'none') payload.reasoning_effort = 'low';
                delete payload.tools; delete payload.tool_choice; delete payload.json_schema; delete payload.response_format;
                payload.enable_web_search = false; payload.request_images = false;
            }
            const budget = Object.hasOwn(payload, 'max_completion_tokens') ? Math.max(quick ? 2048 : 4096, responseLength) : responseLength;
            if (Object.hasOwn(payload, 'max_completion_tokens')) { payload.max_completion_tokens = budget; delete payload.max_tokens; }
            else payload.max_tokens = quick && payload.reasoning_effort && payload.reasoning_effort !== 'none' ? Math.max(2048, budget) : budget;
            diagnostics.maxTokens = payload.max_completion_tokens || payload.max_tokens;
            diagnostics.api = String(context.mainApi || '').slice(0, 40);
            diagnostics.stage = 'request';
            if (typeof context.getRequestHeaders === 'function') {
                diagnostics.transport = 'http-stream'; report(`请求已发出，等待酒馆 HTTP 响应（最多 ${data.test?20:45} 秒）…`);
                const response = await waitRequest(fetch('/api/backends/chat-completions/generate', { method: 'POST', headers: context.getRequestHeaders(), cache: 'no-cache', body: JSON.stringify(payload), signal: controller.signal }), controller, data.test ? Math.min(limits.headers, 20000) : limits.headers, requestFault('no-headers', '酒馆模型请求在时限内没有返回 HTTP 响应头，尚未进入剧情解析。请运行连接测试；本次没有写入进度。'));
                diagnostics.headersMs = Date.now() - diagnostics.started;
                const text = await readModelResponse(response, controller, diagnostics, report, limits); diagnostics.stage = 'complete'; return text;
            }
            if (typeof service.sendRequest === 'function') {
                diagnostics.transport = 'tavern-service'; delete diagnostics.bytes; report('使用酒馆请求接口，等待首个响应…');
                const result = await waitRequest(service.sendRequest(payload, true, controller.signal), controller, limits.headers, requestFault('native-response', '酒馆原生接口在时限内没有返回响应，无法取得 HTTP 阶段信息。请运行连接测试。'));
                if (typeof result !== 'function') return contentText(result?.content);
                let text = '';
                const iterator = result();
                try { while (true) { const chunk = await waitRequest(iterator.next(), controller, limits.idle, requestFault('native-stream', '酒馆流式解析器在时限内没有返回数据。请尝试兼容模式。')); if (chunk.done) break; if (typeof chunk.value?.text === 'string') text = chunk.value.text; diagnostics.outputChars = text.length; diagnostics.stage = text ? 'text' : 'thinking'; report(text ? `正在接收剧情…已收到 ${text.length} 字符` : '模型已连接，等待正文…'); if (text.length > 100000) throw Error('模型回复过长。'); } }
                finally { if (controller.signal.aborted) void iterator.return?.().catch?.(() => {}); }
                return text;
            }
        }
        if (typeof context.generateRaw !== 'function') throw Error('当前酒馆缺少可用的生成接口。');
        diagnostics.transport = 'tavern-raw'; delete diagnostics.bytes; diagnostics.stage = 'native'; report('正在使用酒馆兼容接口生成短正文…');
        task.nativeSettled = false; task.nativePromise = Promise.resolve().then(() => context.generateRaw({ prompt, systemPrompt: data.systemPrompt, responseLength }));
        task.nativePromise.then(() => { task.nativeSettled = true; }, () => { task.nativeSettled = true; });
        const text = await waitRequest(task.nativePromise, controller); diagnostics.outputChars = typeof text==='string'?text.length:0; diagnostics.stage = 'complete'; return text;
    } finally { clearTimeout(totalTimer); diagnostics.elapsedMs = Date.now() - diagnostics.started; }
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
    if (data.type !== 'wenyou:generate' && data.type !== 'wenyou:test') return;
    if (typeof data.id !== 'string' || typeof data.prompt !== 'string' ||
        data.prompt.length > 50000 || typeof data.systemPrompt !== 'string' ||
        data.systemPrompt.length > 5000) return;
    if (inFlight) {
        send({ type: 'wenyou:result', id: data.id, error: activeGeneration?.nativePromise&&!activeGeneration.nativeSettled?'上一条生成尚未结束（旧版酒馆仍在后台运行）。请先停止酒馆生成或等待它结束，避免重复请求。':'上一条生成尚未结束，请稍后再试。' });
        return;
    }
    if (data.type === 'wenyou:test') Object.assign(data, { test: true, generationMode: 'quick', prompt: '请仅回复：连接正常。', systemPrompt: '这是简短连接测试，只需回复一句中文，不输出思考过程。', persona: '' });
    inFlight = true;
    const requestToken = bridgeToken;
    const respond = payload => { if (requestToken === bridgeToken) send(payload); };
    const controller = new AbortController();
    activeGeneration = { id: data.id, token: requestToken, controller };
    const diagnostics = {};
    const task = activeGeneration;
    try {
        let context = globalThis.SillyTavern?.getContext?.();
        if (!context) {
            throw Error('当前酒馆不支持 generateRaw 对象参数接口，请更新至近期官方版本。');
        }
        context = await waitRequest(usePreset(context, data.preset), controller, REQUEST_LIMITS.prepare, requestFault('preset', '应用酒馆预设超时。请切回当前预设重试。'));
        const result = await generateGame(context, data, controller, message => respond({ type: 'wenyou:progress', id: data.id, message, diagnostics: { ...diagnostics } }), diagnostics, task);
        if (typeof result !== 'string' || !result.trim()) {
            throw Error('模型没有返回剧情正文。请检查酒馆连接；若模型启用了长思考，可降低思考强度或换用响应更快的模型。');
        }
        respond({ type: 'wenyou:result', id: data.id, text: data.test ? `连接成功，耗时 ${(diagnostics.elapsedMs/1000).toFixed(1)} 秒。` : result, diagnostics: { ...diagnostics } });
    } catch (error) {
        respond({ type: 'wenyou:result', id: data.id, ...generationError(error), diagnostics: { ...diagnostics, failure: error.kind || error.name || 'error' } });
    } finally {
        const release = () => { if (activeGeneration === task) { activeGeneration = null; inFlight = false; } };
        if (task.nativePromise && !task.nativeSettled) task.nativePromise.then(release, release);
        else release();
    }
}

window.addEventListener('message', receive);
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
else mount();
