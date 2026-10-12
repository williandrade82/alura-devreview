import { combineReducers, configureStore } from "@reduxjs/toolkit";
import authReducer, { signOut, sessionEnded } from "./slices/authSlice";
import rulesReducer from "./slices/rulesSlice";
import historyReducer from "./slices/historySlice";
import adrsReducer from "./slices/adrsSlice";
import membersReducer from "./slices/membersSlice";
import teamsReducer from "./slices/teamsSlice";

const appReducer = combineReducers({
  auth: authReducer,
  rules: rulesReducer,
  history: historyReducer,
  adrs: adrsReducer,
  members: membersReducer,
  teams: teamsReducer,
});

type AppState = ReturnType<typeof appReducer>;

/** Ao sair, descarta os dados do time para não vazarem para o próximo login. */
const rootReducer = (
  state: AppState | undefined,
  action: Parameters<typeof appReducer>[1]
): AppState => {
  if (signOut.fulfilled.match(action) || sessionEnded.match(action)) {
    return appReducer(undefined, action);
  }
  return appReducer(state, action);
};

export const store = configureStore({ reducer: rootReducer });

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
