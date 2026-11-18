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
      return transaction(repo, () => {
        // 신청 존재 확인
        const application = repo.application(applicationId);
        if(!application) throw missing('신청');

        // 담당 운영자 확인
        const event = repo.event(application.eventId);
        if(actor.role !== 'MANAGER' || event.managerId !== actor.id) throw forbidden();

        // 대기 상태 확인
        if(application.status !== "PENDING") throw invalidState();

        // 정원 상태 확인
        if(repo.approvedCount(event.id) >= event.capacity){
          throw new AppError(409,"CAPACITY_FULL",'정원이 다 찼습니다.')
        }

        const updated = repo.setStatus(application.id, 'APPROVED')

        // approve 이력 저장
        repo.addHistory({
          applicationId: applicationId,
          actorId: actor.id,
          action: 'APPROVE',
          fromStatus: 'PENDING',
          toStatus: 'APPROVED',
          reason: null,
          causeHistoryId: null
        });

        return updated;
        });
      },
    revoke(actor,applicationId,reason) {
      // TODO-04: 담당자·APPROVED 검사 → REVOKED + REVOKE 이력.
      // 같은 행사 PENDING 중 created_at ASC, id ASC 첫 1건을 자동 승인합니다.
      // AUTO_APPROVE 이력의 causeHistoryId는 이 요청의 REVOKE 이력 ID입니다.
      // 상태와 이력의 부분 저장을 막고, 거부·오류 시 전체를 되돌리세요.
      // 반환: {revoked: 신청 객체, promoted: 신청 객체 또는 null}.
      // 실제로 존재하는 application을 "reject" 하고 pending 중 첫 1건을 자동 승인해야함.
      return transaction(repo, () =>{
        // 신청 확인
        const application = repo.application(applicationId);
        if(!application) throw missing('신청');

        // 담당자 확인.
        const event = repo.event(application.eventId);
        if(actor.role !== 'MANAGER' || event.managerId !== actor.id) throw forbidden();

        // 승인 상태 확인
        if(application.status !== "APPROVED") throw invalidState();

        // 기존 승인 거부
        const revoked = repo.setStatus(application.id, 'REVOKED')

        const revokeHistoryId = repo.addHistory({
          applicationId: applicationId,
          actorId: actor.id,
          action: 'REVOKE',
          fromStatus: 'PENDING',
          toStatus: 'REVOKED',
          reason: reason,
          causeHistoryId: null
        });

      });
    }
  };
}
