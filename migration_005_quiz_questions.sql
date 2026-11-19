-- v0.8 관리자 퀴즈 문제 편집: Cloudflare D1 Console에서 한 번 실행
CREATE TABLE IF NOT EXISTS quiz_questions (
  id INTEGER PRIMARY KEY CHECK (id BETWEEN 0 AND 2),
  question TEXT NOT NULL,
  choice_0 TEXT NOT NULL,
  choice_1 TEXT NOT NULL,
  choice_2 TEXT NOT NULL,
  choice_3 TEXT NOT NULL,
  correct_index INTEGER NOT NULL CHECK (correct_index BETWEEN 0 AND 3),
  duration_seconds INTEGER NOT NULL DEFAULT 30 CHECK (duration_seconds BETWEEN 10 AND 180),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO quiz_questions(id, question, choice_0, choice_1, choice_2, choice_3, correct_index, duration_seconds) VALUES
(0, '좋은 팀워크의 핵심은?', '혼자 처리하기', '의견 듣고 합의하기', '눈치 보기', '메시지 무시하기', 1, 30),
(1, '우리 팀 아이돌을 만들 때 가장 먼저 정할 것은?', '콘셉트', '프린터', '주차 공간', '퇴근 시간', 0, 30),
(2, '2027년 시무식의 가장 중요한 목표는?', '소통과 협력', '혼자 점수 모으기', '빨리 집에 가기', '정답 없음', 0, 30);
