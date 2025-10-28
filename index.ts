import axios from "axios";

const API_KEY = "ak_e569117e4d36d84217b9617fe84cf1a8a7708fdaf4f05377";
const BASE_URL = "https://assessment.ksensetech.com/api/patients";
const MAX_RETRIES = 5;
const RATE_LIMIT_DELAY = 2000; // 2 seconds delay for rate limiting

// Sleep utility for delays
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Enhanced retry logic with exponential backoff and rate limiting handling
async function fetchPage(page: number, limit: number = 5, retries = 0): Promise<any[]> {
  try {
    const response = await axios.get(BASE_URL, {
      headers: { "x-api-key": API_KEY },
      params: { page, limit },
    });
    
    // Validate response structure
    if (!response.data || !response.data.data) {
      throw new Error(`Invalid response structure for page ${page}`);
    }
    
    return response.data.data;
  } catch (error: any) {
    const status = error.response?.status;
    
    // Handle rate limiting (429)
    if (status === 429) {
      console.log(`Rate limited on page ${page}, waiting ${RATE_LIMIT_DELAY}ms...`);
      await sleep(RATE_LIMIT_DELAY);
      return fetchPage(page, limit, retries);
    }
    
    // Handle server errors (500/503) with exponential backoff
    if ((status === 500 || status === 503) && retries < MAX_RETRIES) {
      const delay = Math.pow(2, retries) * 1000; // Exponential backoff: 1s, 2s, 4s, 8s, 16s
      console.log(`Server error on page ${page}, retrying in ${delay}ms (attempt ${retries + 1}/${MAX_RETRIES})`);
      await sleep(delay);
      return fetchPage(page, limit, retries + 1);
    }
    
    throw error;
  }
}

// Data validation and normalization for inconsistent responses
function validateAndNormalizePatient(patient: any): any {
  return {
    patient_id: patient.patient_id || 'UNKNOWN',
    name: patient.name || 'Unknown Patient',
    age: typeof patient.age === 'number' ? patient.age : parseInt(patient.age) || 0,
    gender: patient.gender || 'U',
    blood_pressure: patient.blood_pressure || 'N/A',
    temperature: typeof patient.temperature === 'number' ? patient.temperature : parseFloat(patient.temperature) || 0,
    visit_date: patient.visit_date || 'N/A',
    diagnosis: patient.diagnosis || 'No diagnosis',
    medications: patient.medications || 'No medications'
  };
}

// Risk Scoring Functions
interface BloodPressureReading {
  systolic: number | null;
  diastolic: number | null;
  isValid: boolean;
}

function parseBloodPressure(bpString: string): BloodPressureReading {
  if (!bpString || bpString === 'N/A' || bpString.trim() === '') {
    return { systolic: null, diastolic: null, isValid: false };
  }

  // Handle various formats: "120/80", "150/", "/90", "INVALID", etc.
  const parts = bpString.split('/');
  
  if (parts.length !== 2) {
    return { systolic: null, diastolic: null, isValid: false };
  }

  const systolic = parts[0]?.trim() || '';
  const diastolic = parts[1]?.trim() || '';

  // Check if either part is empty or non-numeric
  if (systolic === '' || diastolic === '' || 
      isNaN(Number(systolic)) || isNaN(Number(diastolic))) {
    return { systolic: null, diastolic: null, isValid: false };
  }

  return {
    systolic: Number(systolic),
    diastolic: Number(diastolic),
    isValid: true
  };
}

function calculateBloodPressureRisk(bpString: string): number {
  const bp = parseBloodPressure(bpString);
  
  if (!bp.isValid || bp.systolic === null || bp.diastolic === null) {
    return 0; // Invalid/Missing Data
  }

  const systolic = bp.systolic;
  const diastolic = bp.diastolic;

  // Apply the exact criteria from the assessment
  // Normal (Systolic <120 AND Diastolic <80): 1 point
  if (systolic < 120 && diastolic < 80) {
    return 1;
  }
  // Elevated (Systolic 120‑129 AND Diastolic <80): 2 points
  else if (systolic >= 120 && systolic <= 129 && diastolic < 80) {
    return 2;
  }
  // Stage 1 (Systolic 130‑139 OR Diastolic 80‑89): 3 points
  else if ((systolic >= 130 && systolic <= 139) || (diastolic >= 80 && diastolic <= 89)) {
    return 3;
  }
  // Stage 2 (Systolic ≥140 OR Diastolic ≥90): 4 points
  else if (systolic >= 140 || diastolic >= 90) {
    return 4;
  }
  
  // Fallback - shouldn't reach here with valid data
  return 1;
}

function calculateTemperatureRisk(temp: number | string): number {
  if (temp === null || temp === undefined || temp === '') {
    return 0; // Invalid/Missing Data
  }

  const temperature = typeof temp === 'number' ? temp : parseFloat(temp.toString());
  
  if (isNaN(temperature)) {
    return 0; // Invalid/Missing Data
  }

  if (temperature <= 99.5) return 0; // Normal
  if (temperature >= 99.6 && temperature <= 100.9) return 1; // Low Fever
  if (temperature >= 101.0) return 2; // High Fever
  
  return 0;
}

function calculateAgeRisk(age: number | string): number {
  if (age === null || age === undefined || age === '') {
    return 0; // Invalid/Missing Data
  }

  const ageNum = typeof age === 'number' ? age : parseInt(age.toString());
  
  if (isNaN(ageNum)) {
    return 0; // Invalid/Missing Data
  }

  if (ageNum < 40) return 1; // Under 40
  if (ageNum >= 40 && ageNum <= 65) return 1; // 40-65
  if (ageNum > 65) return 2; // Over 65
  
  return 0;
}

function calculatePatientRisk(patient: any): {
  patient_id: string;
  totalRisk: number;
  bpRisk: number;
  tempRisk: number;
  ageRisk: number;
  hasDataQualityIssues: boolean;
} {
  const bpRisk = calculateBloodPressureRisk(patient.blood_pressure);
  const tempRisk = calculateTemperatureRisk(patient.temperature);
  const ageRisk = calculateAgeRisk(patient.age);
  
  const totalRisk = bpRisk + tempRisk + ageRisk;
  
  // Check for data quality issues - be more comprehensive
  const bp = parseBloodPressure(patient.blood_pressure);
  const temp = typeof patient.temperature === 'number' ? patient.temperature : parseFloat(patient.temperature);
  const age = typeof patient.age === 'number' ? patient.age : parseInt(patient.age);
  
  // Data quality issues: invalid BP, invalid temp, invalid age, or missing values
  const hasDataQualityIssues = !bp.isValid || 
                              isNaN(temp) || 
                              isNaN(age) || 
                              patient.blood_pressure === 'N/A' || 
                              patient.blood_pressure === '' ||
                              patient.temperature === 'N/A' ||
                              patient.temperature === '' ||
                              patient.age === 'N/A' ||
                              patient.age === '';
  
  return {
    patient_id: patient.patient_id,
    totalRisk,
    bpRisk,
    tempRisk,
    ageRisk,
    hasDataQualityIssues
  };
}

async function fetchAllPatients(limit: number = 5): Promise<any[]> {
  let patients: any[] = [];
  let page = 1;
  let totalPages = 1;
  let hasNext = true;

  console.log('Starting to fetch all patients...');

  // First, get the total pages from the first request
  try {
    const firstResponse = await axios.get(BASE_URL, {
      headers: { "x-api-key": API_KEY },
      params: { page: 1, limit },
    });
    
    if (firstResponse.data && firstResponse.data.pagination) {
      totalPages = firstResponse.data.pagination.totalPages || 1;
      console.log(`Total pages to fetch: ${totalPages}`);
    }
  } catch (error: any) {
    console.error('Failed to get pagination info:', error.message);
    return patients;
  }

  while (page <= totalPages) {
    try {
      console.log(`Fetching page ${page}/${totalPages}...`);
      
      const pageData = await fetchPage(page, limit);
      
      // Validate and normalize each patient record
      const normalizedPatients = pageData.map(validateAndNormalizePatient);
      patients.push(...normalizedPatients);
      
      console.log(`Page ${page} completed. Total patients so far: ${patients.length}`);
      
      page++;
      
      // Add a small delay between requests to avoid rate limiting
      await sleep(200);
      
    } catch (error: any) {
      console.error(`Failed to fetch page ${page}:`, error.message);
      // Continue to next page instead of breaking
      page++;
    }
  }

  console.log(`Finished fetching. Total patients: ${patients.length}`);
  return patients;
}

// Generate Alert Lists
function generateAlertLists(patients: any[]): {
  high_risk_patients: string[];
  fever_patients: string[];
  data_quality_issues: string[];
} {
  const highRiskPatients: string[] = [];
  const feverPatients: string[] = [];
  const dataQualityIssues: string[] = [];

  patients.forEach(patient => {
    const risk = calculatePatientRisk(patient);
    
    // High-risk patients (total risk score >= 4)
    if (risk.totalRisk >= 4) {
      highRiskPatients.push(patient.patient_id);
    }
    
    // Fever patients (temperature >= 99.6°F) - be more comprehensive
    const temp = typeof patient.temperature === 'number' ? patient.temperature : parseFloat(patient.temperature);
    if (!isNaN(temp) && temp >= 99.6) {
      feverPatients.push(patient.patient_id);
    }
    
    // Data quality issues
    if (risk.hasDataQualityIssues) {
      dataQualityIssues.push(patient.patient_id);
    }
  });

  return {
    high_risk_patients: highRiskPatients,
    fever_patients: feverPatients,
    data_quality_issues: dataQualityIssues
  };
}

// Test the scoring logic with sample data
function testScoringLogic() {
  console.log('=== TESTING RISK SCORING LOGIC ===');
  
  const testPatients = [
    { patient_id: 'TEST001', blood_pressure: '120/80', temperature: 98.6, age: 45 },
    { patient_id: 'TEST002', blood_pressure: '140/90', temperature: 99.8, age: 70 },
    { patient_id: 'TEST003', blood_pressure: '150/', temperature: 101.2, age: 30 },
    { patient_id: 'TEST004', blood_pressure: 'N/A', temperature: 'invalid', age: 'unknown' },
    { patient_id: 'TEST005', blood_pressure: '130/85', temperature: 100.5, age: 55 },
    { patient_id: 'TEST006', blood_pressure: '115/75', temperature: 98.4, age: 35 },
    { patient_id: 'TEST007', blood_pressure: '125/82', temperature: 99.7, age: 68 }
  ];

  testPatients.forEach(patient => {
    const risk = calculatePatientRisk(patient);
    console.log(`Patient ${patient.patient_id}:`);
    console.log(`  BP: ${patient.blood_pressure} (Risk: ${risk.bpRisk})`);
    console.log(`  Temp: ${patient.temperature} (Risk: ${risk.tempRisk})`);
    console.log(`  Age: ${patient.age} (Risk: ${risk.ageRisk})`);
    console.log(`  Total Risk: ${risk.totalRisk}`);
    console.log(`  Data Quality Issues: ${risk.hasDataQualityIssues}`);
    console.log('');
  });
}

// Submit assessment results
async function submitAssessment(alertLists: {
  high_risk_patients: string[];
  fever_patients: string[];
  data_quality_issues: string[];
}): Promise<void> {
  const SUBMIT_URL = "https://assessment.ksensetech.com/api/submit-assessment";
  
  try {
    console.log('=== SUBMITTING ASSESSMENT ===');
    console.log('Submitting alert lists:', JSON.stringify(alertLists, null, 2));
    
    const response = await axios.post(SUBMIT_URL, alertLists, {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY
      }
    });
    
    console.log('✅ Assessment submitted successfully!');
    console.log('Response:', JSON.stringify(response.data, null, 2));
    
  } catch (error: any) {
    console.error('❌ Failed to submit assessment:', error.response?.data || error.message);
    throw error;
  }
}

// Main execution with risk scoring and alert generation
(async () => {
  try {
    console.log('=== Healthcare Assessment - Risk Scoring System ===');
    console.log(`Using API Key: ${API_KEY.substring(0, 10)}...`);
    console.log(`Base URL: ${BASE_URL}`);
    console.log('');

    // Test scoring logic first
    testScoringLogic();

    const patients = await fetchAllPatients(5); // fetch 5 per page
    
    console.log('');
    console.log('=== FETCH SUMMARY ===');
    console.log(`✅ Successfully fetched ${patients.length} patients`);
    
    if (patients.length > 0) {
      // Calculate risk scores for all patients
      const patientRisks = patients.map(patient => ({
        ...patient,
        risk: calculatePatientRisk(patient)
      }));

      console.log('');
      console.log('=== RISK ANALYSIS ===');
      const riskDistribution = patientRisks.reduce((acc, p) => {
        const risk = p.risk.totalRisk;
        acc[risk] = (acc[risk] || 0) + 1;
        return acc;
      }, {} as Record<number, number>);
      
      console.log('Risk Score Distribution:', riskDistribution);
      
      // Generate alert lists
      const alertLists = generateAlertLists(patients);
      
      console.log('');
      console.log('=== ALERT LISTS ===');
      console.log(`High-Risk Patients (≥4): ${alertLists.high_risk_patients.length} patients`);
      console.log(`  IDs: ${alertLists.high_risk_patients.join(', ')}`);
      
      console.log(`Fever Patients (≥99.6°F): ${alertLists.fever_patients.length} patients`);
      console.log(`  IDs: ${alertLists.fever_patients.join(', ')}`);
      
      console.log(`Data Quality Issues: ${alertLists.data_quality_issues.length} patients`);
      console.log(`  IDs: ${alertLists.data_quality_issues.join(', ')}`);
      
      console.log('');
      console.log('=== SUBMISSION READY ===');
      console.log('Alert lists ready for submission:');
      console.log(JSON.stringify(alertLists, null, 2));
      
      await submitAssessment(alertLists);
    }
    
  } catch (err) {
    console.error("❌ Failed to process patients:", err);
    process.exit(1);
  }
})();