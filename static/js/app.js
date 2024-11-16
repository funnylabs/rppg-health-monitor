class HealthMonitoringApp {
    constructor() {
        this.video = document.getElementById('videoInput');
        this.canvas = document.getElementById('canvasOutput');
        this.startButton = document.getElementById('startButton');
        this.stopButton = document.getElementById('stopButton');
        this.glucoseType = document.getElementById('glucoseType');
        
        this.rppgProcessor = null;
        this.vitalsAnalyzer = null;
        this.isProcessing = false;
        
        this.initializeEventListeners();
    }

    async initializeEventListeners() {
        // OpenCV.js 로드 대기
        if (typeof cv === 'undefined') {
            await new Promise(resolve => {
                const script = document.querySelector('script[src*="opencv.js"]');
                script.onload = resolve;
            });
        }

        this.startButton.addEventListener('click', () => this.startMonitoring());
        this.stopButton.addEventListener('click', () => this.stopMonitoring());
        
        // TensorFlow.js 모델 초기화
        await this.initializeModels();
    }

    async initializeModels() {
        try {
            // Face-API.js 모델 로드
            await tf.ready();
            this.rppgProcessor = new RPPGProcessor();
            this.vitalsAnalyzer = new VitalsAnalyzer();
            
            console.log('모든 모델이 로드되었습니다.');
            this.startButton.disabled = false;
        } catch (error) {
            console.error('모델 로드 중 오류 발생:', error);
            alert('모델을 로드하는 중 오류가 발생했습니다. 페이지를 새로고침해주세요.');
        }
    }

    async startMonitoring() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    width: 640,
                    height: 480,
                    facingMode: 'user'
                }
            });
            
            this.video.srcObject = stream;
            await this.video.play();
            
            this.isProcessing = true;
            this.startButton.disabled = true;
            this.stopButton.disabled = false;
            
            // 캔버스 초기화
            this.canvas.width = this.video.videoWidth;
            this.canvas.height = this.video.videoHeight;
            
            // rPPG 처리 시작
            this.processFrame();
            
            // UI 업데이트 시작
            this.updateVitalsUI();
        } catch (error) {
            console.error('카메라 접근 오류:', error);
            alert('카메라에 접근할 수 없습니다. 카메라 권한을 확인해주세요.');
        }
    }

    stopMonitoring() {
        this.isProcessing = false;
        
        // 비디오 스트림 정지
        const stream = this.video.srcObject;
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
        }
        this.video.srcObject = null;
        
        // 버튼 상태 업데이트
        this.startButton.disabled = false;
        this.stopButton.disabled = true;
        
        // 측정값 초기화
        this.resetVitalsDisplay();
    }

    async processFrame() {
        if (!this.isProcessing) return;

        try {
            const signals = await this.rppgProcessor.processVideoFrame(this.video, this.canvas);
            if (signals) {
                await this.vitalsAnalyzer.updateVitals(signals, this.glucoseType.value);
            }
        } catch (error) {
            console.error('프레임 처리 중 오류:', error);
        }

        requestAnimationFrame(() => this.processFrame());
    }

    updateVitalsUI() {
        if (!this.isProcessing) return;

        const vitals = this.vitalsAnalyzer.getVitals();
        
        // UI 업데이트
        document.getElementById('heartRate').textContent = `${vitals.heartRate.toFixed(1)} BPM`;
        document.getElementById('respirationRate').textContent = `${vitals.respirationRate.toFixed(1)} /분`;
        document.getElementById('spo2').textContent = `${vitals.spo2.toFixed(1)} %`;
        document.getElementById('bloodPressure').textContent = `${vitals.systolic}/${vitals.diastolic} mmHg`;
        document.getElementById('hrv').textContent = `${vitals.hrv.toFixed(1)} ms`;
        document.getElementById('sdnn').textContent = `${vitals.sdnn.toFixed(1)} ms`;
        document.getElementById('glucose').textContent = `${vitals.glucose.toFixed(0)} mg/dL`;

        setTimeout(() => this.updateVitalsUI(), 1000);
    }

    resetVitalsDisplay() {
        document.getElementById('heartRate').textContent = '-- BPM';
        document.getElementById('respirationRate').textContent = '-- /분';
        document.getElementById('spo2').textContent = '-- %';
        document.getElementById('bloodPressure').textContent = '--/-- mmHg';
        document.getElementById('hrv').textContent = '-- ms';
        document.getElementById('sdnn').textContent = '-- ms';
        document.getElementById('glucose').textContent = '-- mg/dL';
    }
}

// 앱 초기화
document.addEventListener('DOMContentLoaded', () => {
    const app = new HealthMonitoringApp();
});
