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
exports.Highlighter = void 0;
const monaco_textmate_1 = require("monaco-textmate");
const theme_1 = require("monaco-textmate/dist/theme");
const tmToCm_1 = require("./tmToCm");
const requestIdle = (ms = 10000) => new Promise((res) => {
    if ('requestIdleCallback' in window) {
        window.requestIdleCallback(res, { timeout: ms });
    }
    else {
        setTimeout(res, ms);
    }
});
class Highlighter {
    constructor(theme) {
        if (theme) {
            if (typeof theme.name !== 'string') {
                throw new TypeError(`Theme object must have 'name' property for referencing purposes`);
            }
            this.rawTheme = theme;
            this.theme = theme_1.Theme.createFromRawTheme(theme);
        }
    }
    static addGrammar(scopeName, grammar) {
        Highlighter.scopeNameToRawGrammars.set(scopeName, grammar);
    }
    /**
     * Inject grammars
     * @param scopeName Scope name to inject
     * @param injectInto List of host scope names who will suffer the injection
     */
    static linkInjections(scopeName, injectInto) {
        if (!Array.isArray(injectInto) || !injectInto.every((scope) => typeof scope === 'string')) {
            throw new TypeError(`Second argument to 'linkInjections' must be an array of strings (scope names)`);
        }
        const affectedLanguages = new Set();
        injectInto.forEach((scope) => {
            if (Highlighter.scopeNameToInjections.has(scope)) {
                Highlighter.scopeNameToInjections.get(scope).add(scopeName);
            }
            else {
                Highlighter.scopeNameToInjections.set(scope, new Set().add(scopeName));
            }
            if (Highlighter.scopeNameToLanguageId.has(scope)) {
                affectedLanguages.add(Highlighter.scopeNameToLanguageId.get(scope));
            }
        });
        // Purge existing registry
        Highlighter.registry = null;
        return Array.from(affectedLanguages);
    }
    /**
     * Uninject grammars
     * @param scopeName Previously injected scope name to uninject
     * @param injections If provided injected scope name will be uninjected only from this list of host scope names, otherwise will be uninjected from all
     */
    static unlinkInjections(scopeName, injections) {
        if (!Highlighter.scopeNameToInjections.has(scopeName)) {
            return;
        }
        const affectedLanguages = new Set();
        if (!injections) {
            Highlighter.scopeNameToInjections.forEach((injectionList, hostScopeName) => {
                if (injectionList.has(scopeName)) {
                    if (Highlighter.scopeNameToLanguageId.has(hostScopeName)) {
                        affectedLanguages.add(Highlighter.scopeNameToLanguageId.get(hostScopeName));
                    }
                    injectionList.delete(scopeName);
                }
            });
        }
        else if (!Array.isArray(injections) || !injections.every((scope) => typeof scope === 'string')) {
            throw new TypeError(`Second argument to 'linkInjections' must be an array of strings (scope names)`);
        }
        else {
            Highlighter.scopeNameToInjections.forEach((injectionList, hostScopeName) => {
                if (injections.indexOf(hostScopeName) > -1 && injectionList.has(scopeName)) {
                    if (Highlighter.scopeNameToLanguageId.has(hostScopeName)) {
                        affectedLanguages.add(Highlighter.scopeNameToLanguageId.get(hostScopeName));
                    }
                    injectionList.delete(scopeName);
                }
            });
        }
        // Purge existing registry
        Highlighter.registry = null;
        return Array.from(affectedLanguages);
    }
    static activateLanguage(scopeName, languageId, load = 'defer') {
        return __awaiter(this, void 0, void 0, function* () {
            if (!Highlighter.scopeNameToRawGrammars.has(scopeName)) {
                throw new Error(`'${scopeName}' doesn't have a grammar registered. Use addGrammar to register grammar for itself and it's dependencies`);
            }
            if (Highlighter.languageIdToScopeName.has(languageId)) {
                throw new Error(`Language with ID '${languageId}' is already bound to '${Highlighter.languageIdToScopeName.get(languageId)}'. Overwrite not allowed`);
            }
            Highlighter.languageIdToScopeName.set(languageId, scopeName);
            Highlighter.scopeNameToLanguageId.set(scopeName, languageId);
            if (load === 'now') {
                yield Highlighter.loadLanguage(languageId);
                return true;
            }
            if (load === 'asap') {
                yield requestIdle();
                yield Highlighter.loadLanguage(languageId);
                return true;
            }
            return false;
        });
    }
    static loadLanguage(languageId) {
        const scopeName = Highlighter.languageIdToScopeName.get(languageId);
        if (!scopeName || !Highlighter.scopeNameToRawGrammars.has(scopeName)) {
            return null;
        }
        if (!Highlighter.registry) {
            Highlighter.initRegistry();
        }
        return Highlighter.registry.loadGrammar(scopeName);
    }
    static hasLanguageRegistered(languageId) {
        return Highlighter.languageIdToScopeName.has(languageId);
    }
    static initRegistry() {
        Highlighter.registry = new monaco_textmate_1.Registry({
            getGrammarDefinition(scopeName, dependentScope) {
                return __awaiter(this, void 0, void 0, function* () {
                    if (!Highlighter.scopeNameToRawGrammars.has(scopeName)) {
                        throw new Error(`Grammar for scope '${scopeName}' not found.${dependentScope ? ` It is a dependency of ${dependentScope}. ` : ''} Use addGrammar to register one.`);
                    }
                    let grammar = Highlighter.scopeNameToRawGrammars.get(scopeName);
                    if (typeof grammar === 'function') {
                        grammar = grammar(scopeName);
                        Highlighter.scopeNameToRawGrammars.set(scopeName, grammar);
                    }
                    if (grammar instanceof Promise) {
                        grammar = yield grammar;
                        Highlighter.scopeNameToRawGrammars.set(scopeName, grammar);
                    }
                    if (grammar !== null && typeof grammar === 'object') {
                        return {
                            content: grammar,
                            format: 'json',
                        };
                    }
                    return null;
                });
            },
            getInjections(scopeName) {
                if (Highlighter.scopeNameToInjections.has(scopeName)) {
                    return Array.from(Highlighter.scopeNameToInjections.get(scopeName));
                }
            },
        });
    }
    get cssText() {
        if (!this.cachedCssText) {
            this.cachedCssText = tmToCm_1.cssTextFromTmTheme(this.rawTheme);
        }
        return this.cachedCssText;
    }
    getTokenizer(languageId) {
        return __awaiter(this, void 0, void 0, function* () {
            const grammar = yield Highlighter.loadLanguage(languageId);
            return (stream, state) => {
                const { pos, string: str } = stream;
                if (pos === 0) {
                    const { ruleStack, tokens } = grammar.tokenizeLine(str, state.ruleStack);
                    state.tokensCache = tokens.slice();
                    state.ruleStack = ruleStack;
                }
                const { tokensCache } = state;
                const nextToken = tokensCache.shift();
                if (!nextToken) {
                    stream.skipToEnd();
                    return null;
                }
                const { endIndex, scopes } = nextToken;
                stream.eatWhile(() => stream.pos < endIndex);
                return this.theme
                    ? this.tmScopeToTmThemeToken(scopes)
                    : this.tmScopeToCmToken(scopes);
            };
        });
    }
    tmScopeToCmToken(scopes) {
        let i = scopes.length - 1;
        let cmToken = null;
        do {
            cmToken = tmToCm_1.tmScopeToCmToken(scopes[i--]);
        } while (!cmToken && i >= 0);
        return cmToken;
    }
    tmScopeToTmThemeToken(scopes) {
        let i = scopes.length - 1;
        let cmToken = null;
        do {
            const { foreground, fontStyle } = this.theme.match(scopes[i--])[0];
            if (foreground > 0) {
                cmToken = `tm-${foreground}`;
                cmToken = fontStyle === 0
                    ? cmToken
                    : fontStyle === 1
                        ? cmToken + ' em'
                        : fontStyle === 2
                            ? cmToken + ' strong'
                            : cmToken;
            }
        } while (!cmToken && i >= 0);
        return cmToken;
    }
}
exports.Highlighter = Highlighter;
Highlighter.root = document.head;
Highlighter.scopeNameToInjections = new Map();
Highlighter.scopeNameToRawGrammars = new Map();
Highlighter.scopeNameToLanguageId = new Map();
Highlighter.languageIdToScopeName = new Map();
//# sourceMappingURL=Highlighter.js.map