# KPEC AI IDOL 이미지 생성 연결 (v1.1)

이미지 생성 요청은 **관리자 화면에서만** 실행할 수 있습니다. API 호출은 유료입니다.
이미지가 없을 때에도 기존 퀴즈/아이돌 기획/텍스트 포스터는 그대로 동작합니다.

## 1. Cloudflare D1

D1 > `kpec-ai-db` > Console에 아래 SQL 실행:

```sql
CREATE TABLE IF NOT EXISTS idol_images (
 team_id TEXT PRIMARY KEY REFERENCES teams(id),
 status TEXT NOT NULL DEFAULT 'generating',
 r2_key TEXT,
 model TEXT,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

## 2. R2 버킷 만들기

Cloudflare > Storage & Databases > R2 Object Storage에서
`kpec-ai-idol-images` 버킷 생성. **공개 액세스 활성화 불필요**.
이미지는 Worker의 인증된 `/api/idol/image` 경로로 제공됩니다.

## 3. Wrangler 설정 (버킷 생성 후)

`wrangler.jsonc` 루트 객체에 다음 설정 추가. 기존 `assets`, `d1_databases`는 유지:

```json
"r2_buckets": [
  {
    "binding": "IDOL_IMAGES",
    "bucket_name": "kpec-ai-idol-images"
  }
]
```

GitHub 연동 빌드이므로 Cloudflare 대시보드에만 바인딩을 추가하면
다음 배포 때 wrangler.jsonc 설정과 불일치할 수 있습니다. 저장소 설정도 함께 변경해야 합니다.

## 4. Secret 등록

Workers & Pages > kpec-ai-entertainment > Settings >
Variables and Secrets 에서 `OPENAI_API_KEY`를 **Secret**으로 등록.
API 키를 GitHub 코드나 관리자 입력창, 채팅에 붙여 넣지 마세요.
기존 값이 있으면 새로 등록하지 않아도 됩니다.

## 5. 검증

- 관리자 로그인 > AI IMAGE DIRECTOR > 기획안·이미지 상태 불러오기
- 팀 기획안이 있는 팀만 `✨ 이미지 생성` 버튼 활성화
- 관리자 확인창에서 승인하면 해당 팀당 한 번 호출
- 성공 시 R2 저장, 직원 포스터와 사회자 쇼케이스에 이미지 표시
- 오류가 난 경우 서버가 생성 예약을 취소해 재시도할 수 있음

현재 구현은 모델 `gpt-image-2`, 이미지 `1024x1536`, 품질 `medium`으로
**팀당 1회** 생성합니다. 생성 비용은 API 사용량에 따라 별도 발생합니다.
이미지에는 글자를 직접 그리지 않고 그룹명/슬로건은 웹 포스터에 오버레이합니다.

주의: 이미지 생성 API 요청 중 네트워크가 끊기거나 Worker가 종료되는 극단적 상황에서는
`generating` 상태가 남을 수 있습니다. 운영 전 관리자의 실패 복구 플로우도 테스트하세요.
