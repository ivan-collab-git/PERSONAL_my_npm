import { parentPort, workerData } from 'worker_threads' ;
import { webcrack } from 'webcrack';
import generator from '@babel/generator'

(async () => {
    try {
        let result = await webcrack(workerData.input, workerData.options);
        let scripts = processBundle( result )
        parentPort.postMessage( JSON.stringify({ scripts }) );
    } catch (error) {
        parentPort.postMessage( JSON.stringify({ error }) );
    }
})();

// This will iterate over all bundles and transform the AST into text, and write them into fs
function processBundle( webpackBundleObject ){
    let scripts = []
    if( webpackBundleObject.bundle?.modules ){
        for( let [bundleName, bundle] of webpackBundleObject.bundle.modules){
            let { code: generatedCode } = generator.default(bundle.ast, { /* options */ });
            generatedCode = generatedCode.replace(/\/\*webcrack\:missing\*\//g, "/*missing file*/")
            scripts.push({generatedCode, bundleName })
        }
    }
    else{
        // Save the file as it is, with no name change
        parentPort.postMessage( JSON.stringify({ error: "No modules found." }) );
        scripts = [{ generatedCode: webpackBundleObject.code }]
    }
    return scripts
}