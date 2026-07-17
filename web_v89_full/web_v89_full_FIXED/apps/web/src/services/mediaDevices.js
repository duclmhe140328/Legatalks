const MODE_CONSTRAINTS = {
  auto: { video: true, audio: true },
  video: { video: true, audio: false },
  audio: { video: false, audio: true }
};

export function mediaErrorMessage(error) {
  const name = error?.name || '';
  if (!window.isSecureContext && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
    return 'Camera và micro chỉ hoạt động trên HTTPS hoặc localhost. Khi mở bằng IP LAN, hãy dùng HTTPS.';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'Không tìm thấy camera hoặc micro. Hãy cắm thiết bị, bật thiết bị trong Windows rồi thử lại; bạn cũng có thể chọn chỉ camera hoặc chỉ âm thanh.';
  }
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return 'Trình duyệt đang chặn quyền camera/micro. Hãy cho phép quyền trong biểu tượng ổ khóa cạnh thanh địa chỉ rồi tải lại trang.';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return 'Camera hoặc micro đang được ứng dụng khác sử dụng. Hãy đóng Zoom, Meet, Camera hoặc ứng dụng ghi âm rồi thử lại.';
  }
  if (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError') {
    return 'Thiết bị không hỗ trợ cấu hình camera/micro yêu cầu. Hệ thống sẽ thử chế độ tương thích hơn.';
  }
  if (name === 'SecurityError' || name === 'TypeError') {
    return 'Không thể truy cập camera/micro trong môi trường hiện tại. Hãy dùng HTTPS hoặc localhost và trình duyệt Chrome/Edge mới.';
  }
  return error?.message || 'Không thể mở camera hoặc micro.';
}

export async function inspectMediaDevices() {
  if (!navigator.mediaDevices?.getUserMedia) {
    return {
      supported: false,
      secure: window.isSecureContext || ['localhost', '127.0.0.1'].includes(window.location.hostname),
      hasCamera: false,
      hasMicrophone: false,
      cameras: [],
      microphones: []
    };
  }

  let devices = [];
  try {
    devices = await navigator.mediaDevices.enumerateDevices();
  } catch {
    // Một số trình duyệt chỉ cho enumerate sau khi cấp quyền.
  }
  const cameras = devices.filter((item) => item.kind === 'videoinput');
  const microphones = devices.filter((item) => item.kind === 'audioinput');
  return {
    supported: true,
    secure: window.isSecureContext || ['localhost', '127.0.0.1'].includes(window.location.hostname),
    hasCamera: cameras.length > 0,
    hasMicrophone: microphones.length > 0,
    cameras,
    microphones
  };
}

async function request(constraints) {
  return navigator.mediaDevices.getUserMedia({
    video: constraints.video ? { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 24, max: 30 }, facingMode: 'user' } : false,
    audio: constraints.audio ? { echoCancellation: true, noiseSuppression: true, autoGainControl: true } : false
  });
}

export async function acquireLiveMedia(mode = 'auto') {
  if (!navigator.mediaDevices?.getUserMedia) {
    const error = new Error('Trình duyệt không hỗ trợ camera/micro hoặc trang chưa chạy trên HTTPS.');
    error.name = 'SecurityError';
    throw error;
  }
  if (!window.isSecureContext && !['localhost', '127.0.0.1'].includes(window.location.hostname)) {
    const error = new Error('Camera và micro chỉ hoạt động trên HTTPS hoặc localhost.');
    error.name = 'SecurityError';
    throw error;
  }

  const selected = MODE_CONSTRAINTS[mode] || MODE_CONSTRAINTS.auto;
  if (mode !== 'auto') return request(selected);

  try {
    return await request(selected);
  } catch (error) {
    if (!['NotFoundError', 'DevicesNotFoundError', 'OverconstrainedError', 'ConstraintNotSatisfiedError'].includes(error?.name)) throw error;

    const devices = await inspectMediaDevices();
    if (devices.hasCamera && devices.hasMicrophone) {
      // Thiết bị tồn tại nhưng constraint mặc định không phù hợp.
      return navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    }
    if (devices.hasCamera) return request(MODE_CONSTRAINTS.video);
    if (devices.hasMicrophone) return request(MODE_CONSTRAINTS.audio);
    throw error;
  }
}

export function stopMediaStream(stream) {
  stream?.getTracks?.().forEach((track) => track.stop());
}
