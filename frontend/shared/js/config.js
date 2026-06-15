// Relative path: resolves against the current origin, so the same build works
// both locally and in production where Django serves this frontend itself.
// For a standalone dev server on a different origin, set the absolute URL, e.g.
// const API_BASE_URL = "http://127.0.0.1:8000/api/";
const API_BASE_URL = "/api/";

const LOGIN_URL = "login/";
const REGISTER_URL = "register/";
const LOGOUT_URL = "logout/";
const TOKENREFRESH_URL = "token/refresh/";
const CREATE_QUIZ_URL = "quizzes/";
const GET_QUIZ_URL = "quizzes/";
