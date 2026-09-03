const fs = require('fs');

const serverContent = fs.readFileSync('server.js', 'utf8');

const regex = /app\.(get|post|put|delete|patch)\(['"`](.+?)['"`].*?=>/g;

let match;
const routes = [];

while ((match = regex.exec(serverContent)) !== null) {
    const method = match[1].toUpperCase();
    const path = match[2];
    
    // Attempt to extract middleware
    const line = match[0];
    let roles = '';
    if (line.includes('requireRole([')) {
        const roleMatch = line.match(/requireRole\(\[(.*?)\]\)/);
        if (roleMatch) {
            roles = roleMatch[1].replace(/['"]/g, '');
        }
    }
    let auth = line.includes('authenticateJWT') ? 'Yes' : 'No';

    routes.push(`| \`${method}\` | \`${path}\` | ${auth} | ${roles} |`);
}

const markdown = `
# CityRideTaxi - Complete API Route Analysis

The application exposes the following API routes, categorized by method and path. 
This includes the authentication requirements and allowed roles for each route based on the route definition in \`server.js\`.

| Method | Path | Requires JWT | Allowed Roles |
|--------|------|--------------|---------------|
${routes.join('\n')}
`;

fs.writeFileSync('C:/Users/sures/.gemini/antigravity-ide/brain/3972eb80-28a3-444a-b62d-1085973d64de/routes_analysis.md', markdown);
console.log("Analysis written to artifact");
