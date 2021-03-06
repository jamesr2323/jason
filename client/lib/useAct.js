"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const JasonContext_1 = __importDefault(require("./JasonContext"));
const react_1 = require("react");
function useAct() {
    const { actions } = react_1.useContext(JasonContext_1.default);
    return actions;
}
exports.default = useAct;
