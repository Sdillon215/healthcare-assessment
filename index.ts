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

async function fetchAllPatients(limit: number = 5): Promise<any[]> {
  let patients: any[] = [];
  let page = 1;
  let totalPages = 1;
  let hasNext = true;

  console.log('Starting to fetch all patients...');

  while (hasNext && page <= totalPages) {
    try {
      console.log(`Fetching page ${page}/${totalPages}...`);
      
      const pageData = await fetchPage(page, limit);
      
      // Validate and normalize each patient record
      const normalizedPatients = pageData.map(validateAndNormalizePatient);
      patients.push(...normalizedPatients);
      
      // Get pagination info from the API response
      const response = await axios.get(BASE_URL, {
        headers: { "x-api-key": API_KEY },
        params: { page, limit },
      });
      
      const pagination = response.data.pagination;
      totalPages = pagination?.totalPages || totalPages;
      hasNext = pagination?.hasNext || false;
      
      console.log(`Page ${page} completed. Total patients so far: ${patients.length}`);
      
      page++;
      
      // Add a small delay between requests to avoid rate limiting
      await sleep(100);
      
    } catch (error: any) {
      console.error(`Failed to fetch page ${page}:`, error.message);
      // If we can't fetch a page, we'll stop here
      break;
    }
  }

  console.log(`Finished fetching. Total patients: ${patients.length}`);
  return patients;
}

// Main execution with enhanced error handling and data analysis
(async () => {
  try {
    console.log('=== Healthcare Assessment - Patient Data Fetching ===');
    console.log(`Using API Key: ${API_KEY.substring(0, 10)}...`);
    console.log(`Base URL: ${BASE_URL}`);
    console.log('');

    const patients = await fetchAllPatients(5); // fetch 5 per page
    
    console.log('');
    console.log('=== FETCH SUMMARY ===');
    console.log(`✅ Successfully fetched ${patients.length} patients`);
    
    if (patients.length > 0) {
      console.log('');
      console.log('=== SAMPLE PATIENT DATA ===');
      console.log(JSON.stringify(patients.slice(0, 2), null, 2));
      
      console.log('');
      console.log('=== DATA ANALYSIS ===');
      const ageStats = patients.reduce((acc, p) => {
        acc.total += p.age;
        acc.count++;
        if (p.age > acc.max) acc.max = p.age;
        if (p.age < acc.min) acc.min = p.age;
        return acc;
      }, { total: 0, count: 0, max: 0, min: 999 });
      
      console.log(`Average age: ${(ageStats.total / ageStats.count).toFixed(1)}`);
      console.log(`Age range: ${ageStats.min} - ${ageStats.max}`);
      
      const genderCount = patients.reduce((acc, p) => {
        acc[p.gender] = (acc[p.gender] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      console.log(`Gender distribution:`, genderCount);
    }
    
  } catch (err) {
    console.error("❌ Failed to fetch patients:", err);
    process.exit(1);
  }
})();