const fs = require('fs');

function fixFile(file) {
    let p = fs.readFileSync(file, 'utf8');
    p = p.replace(/channelId:\s*['"]high_priority['"]/g, 'channelId: "manzano_alerts_v1"');
    p = p.replace(/(\s*)(android:\s*\{\s*priority:)/g, '$1apns: { payload: { aps: { sound: "default" } } },$1$2');
    fs.writeFileSync(file, p);
}

fixFile('functions/src/index.ts');
fixFile('functions/send_notification.js');
console.log('Fixed Backend files!');
