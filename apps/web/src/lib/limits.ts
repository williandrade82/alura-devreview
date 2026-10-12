/** Limites de tamanho dos textos. Devem espelhar os checks da migration 00005. */
export const RULE_MAX_LENGTH = 500;
export const ADR_TITLE_MAX_LENGTH = 200;
export const ADR_TEXT_MAX_LENGTH = 5000;
export const TEAM_NAME_MAX_LENGTH = 100;

/** Nome de exibição do usuário. Só validado no front (fica no metadata do Auth, sem check no banco). */
export const PROFILE_NAME_MAX_LENGTH = 100;
/** Espelha minimum_password_length de supabase/config.toml. */
export const MIN_PASSWORD_LENGTH = 8;
