export class AppError extends Error {
  constructor(status, code, message) { super(message); this.status=status; this.code=code; }
}
export const missing = (what='대상') => new AppError(404,'NOT_FOUND',`${what}을 찾을 수 없습니다.`);
export const forbidden = () => new AppError(403,'FORBIDDEN','이 작업을 수행할 권한이 없습니다.');
export const invalidState = () => new AppError(409,'INVALID_STATE','현재 상태에서는 이 작업을 수행할 수 없습니다.');
// TODO-01~04에서 중복 신청을 확인할 때 사용합니다. 승인 취소와 대기 취소 기록도 중복.
export const duplicate = () => new AppError(409, 'DUPLICATE', '이미 신청했습니다.');