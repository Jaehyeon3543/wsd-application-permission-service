import { AppError, missing, forbidden, invalidState,duplicate } from './errors.js';

// TODO-01~04: 업무 규칙과 트랜잭션을 직접 구현합니다. docs/API.md를 먼저 읽으세요.
// actor는 검증된 로그인 사용자입니다. repo의 저장 함수는 권한을 검사하지 않습니다.
// 상태 변경과 이력 저장은 함께 성공하거나 함께 실패해야 합니다.
// 승인 취소와 자동 승급은 신청 2건 + 이력 2건을 한 트랜잭션으로 처리합니다.

// 트랜젝션 구현
function transaction(repo, work) {
  repo.db.exec('BEGIN IMMEDIATE');
  try {
    const result = work();
    repo.db.exec('COMMIT');
    return result;
  } catch (e) {
    repo.db.exec('ROLLBACK');
    throw e;
  }
}

export function createApplicationService(repo) {
  return {
    apply(actor,eventId) {
      return transaction(repo, () => {
        // 행사 존재 확인 (error.js의 missing('행사')를 throw)
        const e = repo.event(eventId); 
        if (!e) throw missing('행사');

        // 학생 역할 확인 (error.js의 forbidden()를 throw)
        if (actor.role !== 'STUDENT') throw forbidden();

        // 중복 신청 확인 (error.js의 duplicate()를 throw)
        const existing = repo.existing(eventId, actor.id);
        if (existing) throw duplicate();

        // PENDING 저장
        const application = repo.insert(eventId, actor.id);

        // APPLY 이력 저장
        repo.addHistory({
          applicationId: application.id,
          actorId: actor.id,
          action: 'APPLY',
          fromStatus: null,
          toStatus: 'PENDING',
          reason: null,
          causeHistoryId: null
        });

        return application;
      });
    },

    cancel(actor,applicationId) {
      return transaction(repo, () => {
        // 신청 존재 확인 (error.js의 missing('신청')를 throw)
        const application = repo.application(applicationId);
        if(!application) throw missing('신청');

        // 본인 확인 (error.js의 forbidden()를 throw)
        if(application.userId !== actor.id) throw forbidden();

        // 신청 상태 확인 (error.js의 invalidState()를 throw)
        if(application.status !== 'PENDING') throw invalidState();

        // CANCELLED로 상태 변경
        const updated = repo.setStatus(applicationId, 'CANCELLED');

        // CANCEL 이력 저장
        repo.addHistory({
          applicationId: applicationId,
          actorId: actor.id,
          action: 'CANCEL',
          fromStatus: 'PENDING',
          toStatus: 'CANCELLED',
          reason: null,
          causeHistoryId: null
        });

        return updated;
      });
    },
    approve(actor,applicationId) {
      // TODO-03: 담당자·PENDING·정원 검사 → APPROVED + APPROVE 이력.
      // 직접 승인은 운영자가 선택합니다. FIFO는 승인 취소 때의 자동 승급에 적용합니다.
      throw new AppError(501,'NOT_IMPLEMENTED','TODO-03 승인과 이력을 구현하세요.');
    },
    revoke(actor,applicationId,reason) {
      // TODO-04: 담당자·APPROVED 검사 → REVOKED + REVOKE 이력.
      // 같은 행사 PENDING 중 created_at ASC, id ASC 첫 1건을 자동 승인합니다.
      // AUTO_APPROVE 이력의 causeHistoryId는 이 요청의 REVOKE 이력 ID입니다.
      // 상태와 이력의 부분 저장을 막고, 거부·오류 시 전체를 되돌리세요.
      // 반환: {revoked: 신청 객체, promoted: 신청 객체 또는 null}.
      throw new AppError(501,'NOT_IMPLEMENTED','TODO-04 승인 취소·자동 승급·이력을 구현하세요.');
    }
  };
}
