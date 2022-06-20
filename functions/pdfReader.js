const { PdfReader } = require("pdfreader");
const fs = require('fs');
let code = [];

new PdfReader().parseFileItems("./all_india_pin_code.pdf", (err, item) => {
    if (err) console.error("error:", err);
    else if (!item) {
        console.log(code.length);
        processPDF();
    }
    else if (item.text) { code.push(item.text); };
});

function processPDF(){
    let newFile = [];
    newFile = code.filter(cd =>  cd.includes('Chennai,TAMIL NADU') || cd.includes('Chennai City') || (cd.includes('Tambaram,Chennai Region') && !cd.includes('Tiruvallur,TAMIL NADU ')));
    console.log(newFile);
    const jsonSet = new Set();
    newFile.forEach(jsp => {
        jsonSet.add(jsp.split(',')[0] +'-'+ jsp.split(',')[1]);
    })
    let jsonArray = Array.from(jsonSet);
    console.log(jsonArray.length);
    fs.writeFileSync('./app.json', JSON.stringify(jsonArray.sort()));
}
