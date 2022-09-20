"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.addTheme = exports.themedHighlighters = exports.unlinkInjections = exports.setRoot = exports.linkInjections = exports.activateLanguage = exports.addGrammar = void 0;
const CodeMirror = require("codemirror");
const monaco_textmate_1 = require("monaco-textmate");
const PCancelable = require("p-cancelable");
const Highlighter_1 = require("./Highlighter");
exports.addGrammar = Highlighter_1.Highlighter.addGrammar;
exports.activateLanguage = Highlighter_1.Highlighter.activateLanguage;
/**
 * Inject grammars into grammars
 * Returns an array of language ID's that were udpated
 *
 * @param scopeName Scope name that needs to be injected into other grammars
 * @param injectInto List of host scope names
 */
function linkInjections(scopeName, injectInto) {
    return __awaiter(this, void 0, void 0, function* () {
        const affectedLanguages = Highlighter_1.Highlighter.linkInjections(scopeName, injectInto);
        yield updateCmTmBindings(null, affectedLanguages);
        return affectedLanguages;
    });
}
exports.linkInjections = linkInjections;
function setRoot(root) {
    Highlighter_1.Highlighter.root = root;
}
exports.setRoot = setRoot;
/**
 * Uninject grammars out of grammars
 * Returns an array of language ID's that were udpated
 *
 * @param scopeName Scope name that needs to be uninjected out of other grammars
 * @param unInjectFrom  If provided, scope name will be uninjected only from this list of host scope names, otherwise will be uninjected from all
 */
function unlinkInjections(scopeName, unInjectFrom) {
    return __awaiter(this, void 0, void 0, function* () {
        const affectedLanguages = Highlighter_1.Highlighter.unlinkInjections(scopeName, unInjectFrom);
        yield updateCmTmBindings(null, affectedLanguages);
        return affectedLanguages;
    });
}
exports.unlinkInjections = unlinkInjections;
exports.themedHighlighters = new Map();
exports.themedHighlighters.set('default', new Highlighter_1.Highlighter());
/**
 * Add a Textmate theme to CodeMirror
 *
 * @param theme Theme object
 */
function addTheme(theme) {
    // TODO: add regex check to theme.name to make sure it's valid CSS classname too
    if (typeof theme.name !== 'string') {
        throw new Error(`RawTheme must have 'name' property for referencing purposes`);
    }
    exports.themedHighlighters.set(theme.name, new Highlighter_1.Highlighter(theme));
}
exports.addTheme = addTheme;
const updateCmTmBindings = (() => {
    // local "static" variables
    const cmModeToTheme = new Map();
    const cmThemeRecord = new WeakMap();
    const tmThemeStyleNodes = new Map();
    /**
     * wrapper around CodeMirror.defineMode
     * If CodeMirror.defineMode is directly called in the primary function below, it causes memory leak by not letting go of cm variable (forms a closure?)
     */
    const defineMode = (languageId, tokenizer) => {
        CodeMirror.defineMode(languageId, () => {
            return {
                copyState: (state) => ({ ruleStack: state.ruleStack.clone() }),
                startState: () => ({ ruleStack: monaco_textmate_1.INITIAL }),
                token: tokenizer,
            };
        });
    };
    // @ts-ignore
    return (cm, invalidateLanguages) => new PCancelable((resolve, reject, onCancel) => __awaiter(void 0, void 0, void 0, function* () {
        onCancel.shouldReject = false;
        let canceled = false;
        onCancel(() => canceled = true);
        if (!cm) {
            if (Array.isArray(invalidateLanguages)) {
                yield Promise.all(invalidateLanguages.map((lang) => __awaiter(void 0, void 0, void 0, function* () {
                    // invalidate previously defined CM mode
                    if (cmModeToTheme.delete(lang)) {
                        // preload update
                        yield Highlighter_1.Highlighter.loadLanguage(lang);
                    }
                })));
            }
            return resolve(false);
        }
        const languageId = cm.getOption('mode');
        const themeName = cm.getOption('theme');
        // get theme name that was bound last time this mode was baked
        const languageBoundTheme = cmModeToTheme.get(languageId);
        const prevThemeName = cmThemeRecord.get(cm) || 'default';
        const highlighter = exports.themedHighlighters.get(themeName) || exports.themedHighlighters.get('default');
        const isTextMateTheme = themeName !== 'default' && exports.themedHighlighters.has(themeName);
        cmThemeRecord.set(cm, themeName);
        if (Highlighter_1.Highlighter.hasLanguageRegistered(languageId)) {
            cmModeToTheme.set(languageId, themeName);
        }
        // Cleanup previous theme resources (if any)
        if (typeof prevThemeName === 'string' &&
            prevThemeName !== 'default' &&
            prevThemeName !== themeName &&
            exports.themedHighlighters.has(themeName) &&
            tmThemeStyleNodes.has(prevThemeName)) {
            const meta = tmThemeStyleNodes.get(prevThemeName);
            if (meta.inUseBy.has(cm) && meta.inUseByCount === 1) {
                tmThemeStyleNodes.delete(prevThemeName);
                Highlighter_1.Highlighter.root.removeChild(meta.styleNode);
            }
            else {
                meta.inUseBy.delete(cm);
                meta.inUseByCount--;
            }
        }
        // Allocate new theme resources (if applicable)
        if (isTextMateTheme) {
            if (tmThemeStyleNodes.has(themeName)) {
                const meta = tmThemeStyleNodes.get(themeName);
                if (!meta.inUseBy.has(cm)) {
                    meta.inUseBy.add(cm);
                    meta.inUseByCount++;
                }
            }
            else {
                const styleNode = document.createElement('style');
                styleNode.textContent = highlighter.cssText;
                tmThemeStyleNodes.set(themeName, { styleNode, inUseBy: new WeakSet().add(cm), inUseByCount: 1 });
                Highlighter_1.Highlighter.root.appendChild(styleNode);
            }
        }
        // Nothing much "changed", hence nothing much is needs to be done
        if (typeof languageId === 'string' && typeof themeName === 'string' && typeof languageBoundTheme === 'string' &&
            // new theme is same as theme that was baked with language previously
            languageBoundTheme === themeName) {
            return resolve(prevThemeName !== themeName);
        }
        // skip if language id cannot be resolved to tm grammar scope
        if (!Highlighter_1.Highlighter.hasLanguageRegistered(languageId)) {
            return resolve(false);
        }
        const tokenizer = yield highlighter.getTokenizer(languageId);
        // user probably changed theme or mode in the meantime, this fn will be triggered again anyway
        if (canceled) {
            return resolve(false);
        }
        defineMode(languageId, tokenizer);
        resolve(true);
    }));
})();
/**
 * Wrapper around `udpateCmTmBindings` that prevents race conditions and obsolute changes
 * Will queue all the CM instances that need an update and will update them one by one (while merging duplicate instances)
 */
const safeUpdateCM = (() => {
    const queue = [];
    const resolverCallbacks = new WeakMap();
    // @ts-ignore
    let currentActivation;
    const proceed = () => __awaiter(void 0, void 0, void 0, function* () {
        const nextCM = queue[0];
        if (!nextCM) {
            return;
        }
        currentActivation = updateCmTmBindings(nextCM);
        const resolver = resolverCallbacks.get(nextCM);
        resolver(yield currentActivation);
        resolverCallbacks.delete(nextCM);
        queue.shift();
        currentActivation = null;
        proceed();
    });
    return (cm) => __awaiter(void 0, void 0, void 0, function* () {
        // currently happening but now obsolete
        if (queue[0] === cm && currentActivation) {
            currentActivation.cancel();
            const prevResolver = resolverCallbacks.get(cm);
            resolverCallbacks.delete(cm);
            queue.shift();
            queue.push(cm);
            prevResolver(false);
        }
        // if hasn't been queued up yet then do it
        if (queue.indexOf(cm) === -1) {
            queue.push(cm);
        }
        const prom = new Promise((res) => {
            resolverCallbacks.set(cm, res);
        });
        // No work is being done === queue not proceeding => start the queue
        if (!currentActivation) {
            proceed();
        }
        return prom;
    });
})();
CodeMirror.defineInitHook((cm) => __awaiter(void 0, void 0, void 0, function* () {
    let shouldIgnoreNextEvent = false;
    let lastLanguageId = null;
    function updateInstance() {
        return __awaiter(this, void 0, void 0, function* () {
            const langId = cm.getOption('mode');
            if (shouldIgnoreNextEvent && langId === lastLanguageId) {
                shouldIgnoreNextEvent = false;
                return;
            }
            if (yield safeUpdateCM(cm)) {
                lastLanguageId = langId;
                shouldIgnoreNextEvent = true;
                cm.setOption('mode', langId);
            }
        });
    }
    cm.on('swapDoc', updateInstance);
    cm.on('optionChange', (inst, option) => {
        if (option === 'mode' || option === 'theme') {
            updateInstance();
        }
    });
    updateInstance();
}));
//# sourceMappingURL=index.js.map