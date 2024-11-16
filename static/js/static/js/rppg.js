class RPPGProcessor {
    constructor() {
        this.frameBuffer = [];
        this.bufferSize = 300; // 10초 분량 (30fps 기준)
        this.faceDetector = new cv.CascadeClassifier();
        this.initializeFaceDetector();
    }

    async initializeFaceDetector() {
        // Haar cascade classifier 로드
        const response = await fetch('https://raw.githubusercontent.com/opencv/opencv/master/data/haarcascades/haarcascade_frontalface_default.xml');
        const buffer = await response.arrayBuffer();
        this.faceDetector.load(new Uint8Array(buffer));
    }

    async processVideoFrame(videoElement, canvasElement) {
        const ctx = canvasElement.getContext('2d');
        
        // 비디오 프레임을 캔버스에 그리기
        ctx.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
        
        // OpenCV.js 매트릭스로 변환
        const src = cv.imread(canvasElement);
        const gray = new cv.Mat();
        cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
        
        // 얼굴 검출
        const faces = new cv.RectVector();
        this.faceDetector.detectMultiScale(gray, faces);
        
        let signals = null;
        
        if (faces.size() > 0) {
            // 가장 큰 얼굴 영역 선택
            const face = faces.get(0);
            
            // ROI(Region of Interest) 설정
            const roiRect = new cv.Rect(
                face.x + face.width * 0.3,
                face.y + face.height * 0.2,
                face.width * 0.4,
                face.height * 0.3
            );
            
            // ROI에서 신호 추출
            signals = this.extractSignals(src, roiRect);
            
            // 디버깅을 위한 ROI 표시
            cv.rectangle(src, roiRect, [255, 0, 0, 255], 2);
        }
        
        // 메모리 해제
        src.delete();
        gray.delete();
        faces.delete();
        
        return signals;
    }

    extractSignals(frame, roi) {
        // ROI에서 RGB 값 추출
        const roiMat = frame.roi(roi);
        const means = cv.mean(roiMat);
        roiMat.delete();
        
        const signal = {
            r: means[0],
            g: means[1],
            b: means[2],
            timestamp: Date.now()
        };
        
        // 신호 버퍼 업데이트
        this.frameBuffer.push(signal);
        if (this.frameBuffer.length > this.bufferSize) {
            this.frameBuffer.shift();
        }
        
        return this.preprocessSignals();
    }

    preprocessSignals() {
        if (this.frameBuffer.length < 90) { // 최소 3초 데이터 필요
            return null;
        }
        
        // 신호 정규화 및 필터링
        const normalizedSignals = this.normalizeSignals();
        const filteredSignals = this.applyBandpassFilter(normalizedSignals);
        
        return {
            raw: this.frameBuffer,
            normalized: normalizedSignals,
            filtered: filteredSignals
        };
    }

    normalizeSignals() {
        const signals = {
            r: [], g: [], b: []
        };
        
        // 이동 평균 계산을 위한 윈도우 크기
        const windowSize = 30; // 1초 분량
        
        this.frameBuffer.forEach((frame, i) => {
            if (i >= windowSize) {
                const window = this.frameBuffer.slice(i - windowSize, i);
                const mean = {
                    r: window.reduce((sum, f) => sum + f.r, 0) / windowSize,
                    g: window.reduce((sum, f) => sum + f.g, 0) / windowSize,
                    b: window.reduce((sum, f) => sum + f.b, 0) / windowSize
                };
                
                signals.r.push((frame.r - mean.r) / mean.r);
                signals.g.push((frame.g - mean.g) / mean.g);
                signals.b.push((frame.b - mean.b) / mean.b);
            }
        });
        
        return signals;
    }

    applyBandpassFilter(signals) {
        // 심박수 범위에 해당하는 주파수 대역 (0.75Hz ~ 4Hz)
        const filtered = {
            r: this.bandpassFilter(signals.r, 30, 0.75, 4),
            g: this.bandpassFilter(signals.g, 30, 0.75, 4),
            b: this.bandpassFilter(signals.b, 30, 0.75, 4)
        };
        
        return filtered;
    }

    bandpassFilter(signal, fps, lowCut, highCut) {
        // FFT 변환
        const fft = new FFT(signal.length);
        const spectrum = fft.forward(signal);
        
        // 주파수 영역에서 필터링
        const df = fps / signal.length;
        spectrum.forEach((value, i) => {
            const frequency = i * df;
            if (frequency < lowCut || frequency > highCut) {
                spectrum[i] = 0;
            }
        });
        
        // 역 FFT 변환
        return fft.inverse(spectrum);
    }
}

// FFT 구현 (간단한 버전)
class FFT {
    constructor(size) {
        this.size = size;
    }
    
    forward(signal) {
        // 실제 구현에서는 FFT 라이브러리 사용 권장
        return this.dft(signal);
    }
    
    inverse(spectrum) {
        // 실제 구현에서는 FFT 라이브러리 사용 권장
        return this.idft(spectrum);
    }
    
    dft(signal) {
        const N = signal.length;
        const spectrum = new Array(N);
        
        for (let k = 0; k < N; k++) {
            let real = 0;
            let imag = 0;
            
            for (let n = 0; n < N; n++) {
                const phi = (2 * Math.PI * k * n) / N;
                real += signal[n] * Math.cos(phi);
                imag -= signal[n] * Math.sin(phi);
            }
            
            spectrum[k] = Math.sqrt(real * real + imag * imag);
        }
        
        return spectrum;
    }
    
    idft(spectrum) {
        const N = spectrum.length;
        const signal = new Array(N);
        
        for (let n = 0; n < N; n++) {
            let real = 0;
            
            for (let k = 0; k < N; k++) {
                const phi = (2 * Math.PI * k * n) / N;
                real += spectrum[k] * Math.cos(phi);
            }
            
            signal[n] = real / N;
        }
        
        return signal;
    }
}
