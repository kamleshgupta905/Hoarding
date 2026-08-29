import fs from 'fs';
let content = fs.readFileSync('src/pages/ClientReport.jsx', 'utf8');

content = content.replace("import { useParams, useNavigate } from 'react-router-dom';", "import { useParams, useNavigate, useSearchParams } from 'react-router-dom';");

content = content.replace("const { clientName } = useParams();\n    const navigate = useNavigate();", "const { clientName } = useParams();\n    const navigate = useNavigate();\n    const [searchParams] = useSearchParams();");

content = content.replace("const clientSites = hoardings.filter(h => \n        h.BookedBy?.toLowerCase() === decodedName.toLowerCase() && \n        h.STATUS === 'Occupied'\n    );", `const sitesParam = searchParams.get('sites');
    const isProposal = !!sitesParam;
    
    let clientSites = [];
    if (isProposal) {
        const siteIds = new Set(sitesParam.split(','));
        clientSites = hoardings.filter(h => siteIds.has(h.UniqueID) || siteIds.has(h._SiteID) || siteIds.has(h.ID) || siteIds.has(h['Site Code']));
    } else {
        clientSites = hoardings.filter(h => 
            h.BookedBy?.toLowerCase() === decodedName.toLowerCase() && 
            h.STATUS === 'Occupied'
        );
    }`);

content = content.replace("<h2>No Active Campaigns</h2>", "<h2>{isProposal ? 'No Sites Found' : 'No Active Campaigns'}</h2>");

content = content.replace("<h1>{decodedName} • Live Campaign</h1>", "<h1>{decodedName} • {isProposal ? 'Proposal Deck' : 'Live Campaign'}</h1>");

fs.writeFileSync('src/pages/ClientReport.jsx', content);
