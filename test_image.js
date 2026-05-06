const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');

async function test() {
  try {
    const form = new FormData();
    // Assuming 'crop 1.webp' exists in root
    form.append('image', fs.createReadStream('crop 1.webp'));
    form.append('language', 'en');
    form.append('location', 'Lahore');

    const res = await axios.post('http://localhost:3000/api/image-query', form, {
      headers: { ...form.getHeaders() }
    });
    console.log(JSON.stringify(res.data, null, 2));
  } catch (err) {
    console.error('ERROR:', err.response?.data || err.message);
  }
}
test();
