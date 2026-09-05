# Agent 로그인 요청 보호 및 IP별 가입 관측 설계안

상태: **설계안만 작성. 백엔드 코드·DB·운영 설정은 변경하지 않음.**

## 목표

Agent 자동 가입과 무료 혜택은 유지한다. 사람 승인·설치 인증·새 결제 조건은 추가하지 않는다. 서버가 처리하는 인증 작업량을 제한하고, 어느 IP에서 실제로 몇 개의 계정이 생성됐는지 관측한다. IP는 네트워크 출발지이지 사람/Agent의 고유 ID가 아니다.

## 현재 확인한 구조

- `HeyTraders/api_server/presentation/api/v1/routes/auth_bff.py`: challenge/complete는 각각 Redis 기반 IP당 30회/60초 제한을 호출한다. 공개키·서명·표시명 등 필드 길이도 제한한다.
- `api_server/application/auth/agent_browser_session.py`: challenge 120초, access session 15분, refresh session 30일이다.
- `src/hey_traders/trading_utils/db_manager/agent_auth_repo.py`: challenge마다 INSERT 전에 과거 challenge DELETE까지 실행한다. 요청 수만큼 정리 쿼리도 반복된다.
- complete는 서명 확인 후 한 트랜잭션에서 challenge를 소비하며, 공개키별 잠금으로 동일 키의 동시 가입을 하나로 묶는다. 이 원자성은 유지한다.
- `migrations/20260903135830_agent_owned_browser_auth.sql`: challenge·로그인 키·세션에 생성 IP가 없다. 과거 가입 IP를 현재 데이터만으로 복원할 수 있다고 보장할 수 없다.
- 공용 `get_client_ip()`는 신뢰 프록시 여부를 확인하지만 X-Forwarded-For 맨 앞 문자열을 반환한다. 운영 프록시의 헤더 정규화와 주소 형식 검증을 확인해야 한다.

## 1. 인증 작업량 상한

권장 경로: `본문 크기/형식 제한 → 신뢰 IP 추출 → Redis admission → challenge 단건 처리 → 서명 검증 → 원자적 로그인/가입`.

- 인증 본문 상한을 JSON 파싱 전 ingress/ASGI 계층에 적용한다. 초기 제안은 4 KiB. Content-Length뿐 아니라 실제 수신량도 제한한다.
- IP당 30회/분은 우선 유지하고 설정으로 조정 가능하게 한다. challenge/complete를 구분하며 일반 refresh에 신규 가입 제한을 적용하지 않는다.
- 기존 Redis 제한 소유자에 인증 전체 처리 예산과 순간 폭주 한도를 추가한다. 분산 IP에서도 DB/서명 검증의 전체 처리량을 제한한다. 수치는 운영에 영향 없는 부하 측정 후 결정한다.
- API 프로세스별 인증 동시 실행 수와 대기 시간을 제한한다. 무제한 대기열은 만들지 않는다. 요청량 초과는 429 + Retry-After, 의존 시스템 장애/처리 용량 부족은 503으로 빠르게 반환한다. 기존 Redis 장애 시 fail-closed 처리를 유지한다.
- 차단/서명 실패를 매번 DB 행으로 저장하지 않는다. 요청/실패/429/503은 메트릭 또는 TTL 있는 Redis 집계로 수집하고 IP별 집계 키 개수도 제한한다. 관측 기능 자체의 쓰기 폭주를 피한다.

명령 전 서버 세션 확인은 공유 쿠키의 계정 변경을 감지하기 위해 유지한다. 이는 새로운 challenge/가입 요청이 아니며 정상 refresh는 기존 세션 서비스가 처리한다.

## 2. challenge 정리를 로그인 응답 경로에서 분리

- `create_challenge()`의 매 요청 DELETE를 제거한다. PostgreSQL을 challenge의 유일한 저장소로 유지하여 기존 소비·가입 트랜잭션을 보존한다. Redis와 인증 상태를 중복 관리하지 않는다.
- `(expires_at, id)` 인덱스와 소량 배치 삭제 메서드를 추가한다. pending 전용 부분 인덱스로 소비 완료 행 정리까지 해결된다고 가정하지 않는다.
- 기존 서버 운영 작업 체계에서 단일 실행자/분산 잠금으로 주기 정리한다. 매 요청 BackgroundTask나 새로운 Vault/Pod는 사용하지 않는다.
- 초기 제안: 만료 후 10분 보존, 1분 주기, 배치당 최대 1,000행 및 주기당 총 작업량 상한. `FOR UPDATE SKIP LOCKED`로 인증 중인 행과 충돌을 줄인다. 실측 후 조정한다.
- 정리 장애는 로그인과 분리하되 미정리 행 수·최고 나이로 감지한다. 전역 admission으로 장기 장애 중 저장 증가 속도도 제한한다.

## 3. 실제 신규 계정 생성만 DB 기록

서버 전용 `private.agent_registration_events`를 제안한다.

| 필드 | 의미 |
| --- | --- |
| `user_id uuid PRIMARY KEY` | 실제 계정당 정확히 한 가입 기록 |
| `agent_id uuid NOT NULL` | 생성된 Agent와 조사 결과 연결 |
| `created_at timestamptz NOT NULL` | 가입 트랜잭션 시각 |
| `signup_ip inet NULL` | complete 요청에서 서버가 추출한 IPv4/IPv6 주소 |
| `ip_source text NOT NULL` | direct / trusted_proxy / unavailable 등 추출 근거 |
| `app_origin text NOT NULL` | 검증된 HeyTraders 앱 환경 |

- `consume_challenge_and_create_session()`의 **신규 Users 생성 분기 안에서 같은 트랜잭션으로 INSERT**한다. 감사 기록 실패 시 신규 가입도 롤백하여 누락을 피한다.
- 신규 여부는 서버의 기존 키 조회 결과가 결정한다. 동일 키 동시 가입은 1행, 서로 다른 계정은 N행, 기존 계정 로그인/refresh는 0행 추가여야 한다.
- 가입 IP는 가입 완료 요청의 IP로 정의한다. challenge 발급 때와 IP가 달라도 차단하지 않는다. 발급 IP까지 필요해질 때 별도로 확장한다.
- 계정 삭제가 감사 기록을 자동 cascade-delete하지 않도록 감사용 ID 스냅샷을 보관한다. 보존 기한과 별도 개인정보 삭제 처리에 따라 제거한다.
- 토큰·쿠키·원문 서명·개인키·전체 요청 본문은 저장하지 않는다. 재로그인 위치도 필요하면 이후 기존 세션의 created_ip/last_auth_ip를 설계하고, 매 화면/API 요청마다 쓰지 않는다.

## 4. IP 신뢰성·보존·조회

- 주소 추출을 공용 네트워크 메타데이터 소유자 한 곳으로 모아 limiter와 감사 기록에 같은 값을 사용한다.
- 직접 요청은 소켓 peer IP를 사용한다. 프록시 요청은 실제 배포 체인의 신뢰 설정과 헤더 정규화 계약을 검증한다. 임의의 X-Forwarded-For/CF 헤더를 믿지 않는다.
- IPv4/IPv6를 파싱·정규화하고 IPv4-mapped IPv6도 일관되게 처리한다. 알 수 없는 주소는 inet에 `unknown` 문자열을 넣지 않고 NULL과 근거를 기록한다.
- 인덱스는 `(signup_ip, created_at)`과 기간 정리용 `created_at`부터 적용한다.
- 초기 제안은 원본 IP 30일 보관·관리자 전용 접근이다. 장기 통계는 원본 IP 없는 일별 전체 집계로 남긴다. 장기 IP별 추적은 보존 정책을 정한 뒤 확장한다.
- 최초 단계는 관리 조회/API면 충분하며 일반 사용자 프론트에는 원본 IP를 노출하지 않는다.

조회: 최근 24시간/7일 IP별 신규 계정 수, 최초·최근 가입 시각, 해당 Agent/user 목록.
운영 지표: 전체 challenge/서명 실패/로그인 성공/**실제 신규 가입**/429/503, 인증 지연, DB 쿼리 시간, 미정리 challenge. 요청량과 가입 수를 구분한다.

## 소유자 및 승인 후 검증

- `auth_bff.py`: 입력 검증과 신뢰 IP 전달. 가입 판단/SQL을 중복 추가하지 않음.
- 공용 IP resolver + `presentation/api/v1/services/rate_limit.py`: 주소 해석과 Redis admission 정책.
- `agent_auth_repo.py`: 원자적 신규 가입 기록, challenge 단건 처리, 별도 bounded cleanup.
- 새 forward migration: 감사 테이블·인덱스·서버 전용 접근 및 cleanup 인덱스. 적용된 migration은 수정하지 않음.
- 기존 백엔드 운영 작업 소유자: 주기 정리/집계.

검증: 동일 키 동시 가입 1건, 동일 IP 서로 다른 계정 N건, 재로그인 추가 0건, 감사 실패 전체 롤백, 잘못된 서명/재사용 challenge 미가입, 위조 프록시 헤더/잘못된 주소/IPv6, Redis 장애/과부하 빠른 거절, 정리 중 인증 정상 동작, 보존 기한 삭제, 운영 계정에 손대지 않는 부하 시험.

결론: **무료 혜택은 그대로 두고, 요청 비용 상한 + 실제 신규 가입 IP 기록 + 운영 지표부터 추가한다.**
