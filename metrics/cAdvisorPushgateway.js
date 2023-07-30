const axios = require('axios');
const { Registry, Gauge } = require('prom-client');

// cAdvisor 엔드포인트 URL
const cadvisorUrl = 'http://localhost:8080/metrics';

// Pushgateway 엔드포인트 URL
const pushgatewayUrl = 'http://220.90.135.177:3049/metrics/job/azure_flexing-cps-rc-servers';

// 메트릭 레지스트리 생성
const registry = new Registry();

// cAdvisor에서 메트릭 데이터 가져오기
async function fetchMetricsFromCadvisor() {
  const response = await axios.get(cadvisorUrl);
  const metricsData = response.data;

  const containerMetrics = metricsData.split('\n').filter(line => line.startsWith('container_last_seen'));

  // 메트릭 데이터를 name과 value로 분리하여 추출
  containerMetrics.forEach(metric => {
    const [rawMetric, rawValue] = metric.split(' ');
    const metricParts = rawMetric.split('{');
    const metricName = metricParts[0].trim(); // 메트릭 이름
    const labelsString = metricParts[1].replace('}', ''); // 라벨 문자열

    const labelPairs = labelsString.split(',').map(pair => {
      const [labelName, labelValue] = pair.split('=');
      return { name: labelName.trim(), value: labelValue.replace(/"/g, '').trim() };
    });

    let metricValue = parseFloat(rawValue); // 문자열로 된 값을 숫자로 변환

     // 메트릭 생성
     if(isNaN(metricValue)) {
      metricValue = parseFloat(1.68852036e+09);
     }
     const existingMetric = registry.getSingleMetric(metricName);
     let gaugeMetric;
     if(existingMetric && existingMetric instanceof Gauge) {
      gaugeMetric = existingMetric;
     } else {
      const gaugeMetric = new Gauge({
        name: metricName,
        help: 'cAdvisor custom metric',
        labelNames: labelPairs.map(pair => pair.name),
        registers: [registry],
      });
     }
    // 메트릭 값 설정
    gaugeMetric.set(labelPairs.reduce((acc, pair) => {
      acc[pair.name] = pair.value;
      return acc;
    }, {}), metricValue);

    // 메트릭 데이터 전송
    registry.metrics()
      .then(metricData => {
        axios.put(pushgatewayUrl, metricData)
          .then(response => {
            console.log('Metrics data sent successfully:', response.data);
          })
          .catch(error => {
            console.error('Failed to send metrics data:', error);
          });
      })
      .catch(error => {
        console.error('Failed to get metric data:', error);
      });
  console.log(registry)
  });
}
// 메트릭 업데이트 및 전송 주기 설정
const updateInterval = setInterval(async () => {
  await fetchMetricsFromCadvisor();
}, 5000); // 5초마다 업데이트 및 전송

// 프로세스 종료 시 정리 작업
process.on('SIGINT', () => {
  clearInterval(updateInterval);
});

