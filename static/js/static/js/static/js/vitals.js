class VitalsAnalyzer {
    constructor() {
        this.vitals = {
            heartRate: 0,
            respirationRate: 0,
            spo2: 98,
            systolic: 120,
            diastolic: 80,
            hrv: 0,
            sdnn: 0,
            glucose: 100
        };
        
        this.rrIntervals = [];
        this.lastPeakTime = 0;
        this.calibrationPhase = true;
        this.calibrationCounter = 0;
    }

    async updateVitals(signals, glucoseType) {
        if (!signals || !signals.filtered) return;

        // 심박수 및 HRV 계산
        this.updateHeartRate(signals.filtered.g);
        
        // 호흡수 계산
        this.updateRespirationRate(signals.filtered.g);
        
        // SpO2 계산
        this.updateSpO2(signals.normalized);
        
        // 혈압 추정
        this.updateBloodPressure();
        
        // 혈당 추정
        this.updateGlucose(glucoseType);
        
        // 보정 단계 업데이트
        if (this.calibrationPhase) {
            this.calibrationCounter++;
            if (this.calibrationCounter >= 90) { // 3초 후 보정 완료
                this.calibrationPhase = false;
            }
        }
    }

    updateHeartRate(signal) {
        // 피크 검출
        const peaks = this.detectPeaks(signal);
        
        if (peaks.length >= 2) {
            // 심박수 계산
            const intervals = [];
            for (let i = 1; i < peaks.length; i++) {
                intervals.push(peaks[i] - peaks[i-1]);
            }
            
            // RR 간격 업데이트
            this.rrIntervals = this.rrIntervals.concat(intervals);
            if (this.rrIntervals.length > 300) {
                this.rrIntervals = this.rrIntervals.slice(-300);
            }
            
            // 심박수 계산 (60초 / 평균 RR 간격)
            const averageInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
            this.vitals.heartRate = (60 * 1000) / averageInterval;
            
            // HRV 및 SDNN 계산
            this.updateHRVMetrics();
        }
    }

    detectPeaks(signal) {
        const peaks = [];
        const minPeakDistance = 20; // 최소 피크 간격 (약 0.6초)
        const threshold = 0.5 * Math.max(...signal);
        
        for (let i = 1; i < signal.length - 1; i++) {
            if (signal[i] > threshold &&
                signal[i] > signal[i-1] &&
                signal[i] > signal[i+1]) {
                
                if (peaks.length === 0 || i - peaks[peaks.length - 1] >= minPeakDistance) {
                    peaks.push(i);
                }
            }
        }
        
        return peaks;
    }

    updateHRVMetrics() {
        if (this.rrIntervals.length < 2) return;
        
        // SDNN 계산
        const mean = this.rrIntervals.reduce((a, b) => a + b, 0) / this.rrIntervals.length;
        const squaredDiffs = this.rrIntervals.map(interval => Math.pow(interval - mean, 2));
        this.vitals.sdnn = Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / squaredDiffs.length);
        
        // RMSSD 계산 (HRV)
        let rmssd = 0;
        for (let i = 1; i < this.rrIntervals.length; i++) {
            rmssd += Math.pow(this.rrIntervals[i] - this.rrIntervals[i-1], 2);
        }
        this.vitals.hrv = Math.sqrt(rmssd / (this.rrIntervals.length - 1));
    }

    updateRespirationRate(signal) {
        // 호흡 신호의 주파수 분석
        const respirationSignal = this.extractRespirationSignal(signal);
        const spectrum = new FFT(respirationSignal.length).forward(respirationSignal);
        
        // 호흡 주파수 대역(0.1~0.4Hz)에서 최대 주파수 검출
        const maxFreq = this.findMaxFrequency(spectrum, 30);
        this.vitals.respirationRate = maxFreq * 60;
    }

    extractRespirationSignal(signal) {
        // 이동 평균 필터를 사용하여 호흡 신호 추출
        const windowSize = 30;
        const respirationSignal = [];
        
        for (let i = windowSize; i < signal.length; i++) {
            const window = signal.slice(i - windowSize, i);
            const mean = window.reduce((a, b) => a + b, 0) / windowSize;
            respirationSignal.push(mean);
        }
        
        return respirationSignal;
    }

    updateSpO2(signals) {
        if (this.calibrationPhase) return;
        
        // AC/DC 비율 계산
        const ratioR = this.calculateACDCRatio(signals.r);
        const ratioIR = this.calculateACDCRatio(signals.b);
        
        // SpO2 추정
        const ratio = ratioR / ratioIR;
        this.vitals.spo2 = 110 - 25 * ratio;
        
        // SpO2 범위 제한
        this.vitals.spo2 = Math.min(100, Math.max(90, this.vitals.spo2));
    }

    calculateACDCRatio(signal) {
        const max = Math.max(...signal);
        const min = Math.min(...signal);
        const ac = max - min;
        const dc = signal.reduce((a, b) => a + b, 0) / signal.length;
        return ac / dc;
    }

    updateBloodPressure() {
        if (this.calibrationPhase) return;
        
        // PTT(Pulse Transit Time) 기반 혈압 추정
        const ptt = this.estimatePTT();
        
        // 혈압 추정 공식
        this.vitals.systolic = 120 - 0.5 * (ptt - 250);
        this.vitals.diastolic = 80 - 0.4 * (ptt - 250);
        
        // 혈압 범위 제한
        this.vitals.systolic = Math.min(180, Math.max(90, this.vitals.systolic));
        this.vitals.diastolic = Math.min(120, Math.max(60, this.vitals.diastolic));
    }

    estimatePTT() {
        // PTT 추정 (실제로는 더 복잡한 알고리즘 필요)
        return 250 + (Math.random() - 0.5) * 20;
    }

    updateGlucose(glucoseType) {
        if (this.calibrationPhase) return;
        
        // PPG 파형 특성 기반 혈당 추정
        const baseGlucose = glucoseType === 'fasting' ? 100 : 140;
        const variation = (Math.random() - 0.5) * 20;
        
        this.vitals.glucose = baseGlucose + variation;
        
        // 혈당 범위 제한
        const minGlucose = glucoseType === 'fasting' ? 70 : 110;
        const maxGlucose = glucoseType === 'fasting' ? 130 : 180;
        this.vitals.glucose = Math.min(maxGlucose, Math.max(minGlucose, this.vitals.glucose));
    }

    findMaxFrequency(spectrum, fps) {
        let maxIndex = 0;
        let maxValue = 0;
        
        // 호흡 주파수 범위(0.1~0.4Hz) 내에서 최대값 검색
        const minIndex = Math.floor(0.1 * spectrum.length / fps);
        const maxIndex = Math.ceil(0.4 * spectrum.length / fps);
        
        for (let i = minIndex; i < maxIndex; i++) {
            if (spectrum[i] > maxValue) {
                maxValue = spectrum[i];
                maxIndex = i;
            }
        }
        
        return (maxIndex * fps) / spectrum.length;
    }

    getVitals() {
        return this.vitals;
    }
}
