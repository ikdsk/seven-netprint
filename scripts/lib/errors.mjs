// 終了コードとエラー型
export const EXIT = { OK: 0, USAGE: 2, HUMAN: 3, SITE: 4, UNVERIFIED: 5 };

export class NetprintError extends Error {
  /**
   * @param {string} code 機械可読コード
   * @param {string} message 人間向けメッセージ
   * @param {{exit?: number, humanActionRequired?: boolean}} [opts]
   */
  constructor(code, message, { exit = EXIT.SITE, humanActionRequired = false } = {}) {
    super(message);
    this.code = code;
    this.exit = exit;
    this.humanActionRequired = humanActionRequired;
  }
}

export const usageError = (code, msg) => new NetprintError(code, msg, { exit: EXIT.USAGE });
export const humanError = (code, msg) =>
  new NetprintError(code, msg, { exit: EXIT.HUMAN, humanActionRequired: true });
export const siteError = (code, msg) => new NetprintError(code, msg, { exit: EXIT.SITE });
export const unverifiedError = (code, msg) =>
  new NetprintError(code, msg, { exit: EXIT.UNVERIFIED });
