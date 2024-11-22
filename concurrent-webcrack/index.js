import fs from 'fs';
import path from 'path'
import PQueue from 'p-queue'
import { Worker } from 'worker_threads'
const prettier = await import('prettier');
import { fileURLToPath } from 'url';

// This assumes that two modules that have the same name unpacked from the same bundled, are the same. I've checked it for some and the only
// thing that it changes is the variable names

export default async function unpackFiles( baseDirectoryTree, baseDestinationDirectory, sizeLimit, unpackingConcurrencySmallFiles, unpackingConcurrencyBigFiles, unpackingTimeout ){

    global.unpackedCount = { unpackedFiles: 0, totalFiles: 0, timedOut: 0, sizeLimit: 0 }
    console.time("Execution time")
    process.on('exit', () => {
        console.log( unpackedCount )
        console.timeEnd("Execution time")
    });

    let queueBigFiles = new PQueue({ concurrency: unpackingConcurrencyBigFiles });
    let queueSmallFiles = new PQueue({ concurrency: unpackingConcurrencySmallFiles });

    let queuesFunctions ={
        queueUnpackSmallBundle( input, fileDestinationPath, fileSourcePath, unpackingTimeout ){
            return queueSmallFiles.add(() => unpackBundle( input, fileDestinationPath, fileSourcePath, unpackingTimeout ));
        },
        queueUnpackBigBundle( input, fileDestinationPath, fileSourcePath, unpackingTimeout ){
            return queueBigFiles.add(() => unpackBundle( input, fileDestinationPath, fileSourcePath, unpackingTimeout ));
        },
    }

    //await unpackFsTree( baseDirectoryTree, baseDestinationDirectory, queuesFunctions, sizeLimit, unpackingTimeout )
    unpackFsTree( baseDirectoryTree, baseDestinationDirectory, queuesFunctions, sizeLimit, unpackingTimeout )

    let promises = [
        queueBigFiles.onIdle().then(() => {
            console.log('All big file tasks have been processed, and the queue is now idle.');
        }),
        queueSmallFiles.onIdle().then(() => {
            console.log('All small file tasks have been processed, and the queue is now idle.');
        })
    ]

    await Promise.allSettled( promises ).then(() => {
        console.log('Both queues have finished processing.');
    });
}


// Will iterate over a directory and unpack every file and directory recursively
function unpackFsTree( baseDirectoryTree, baseDestinationDirectory, queuesFunctions, sizeLimit, unpackingTimeout ){
    //if( !fs.existsSync( baseDirectoryTree ) ) throw new Error("The provided directory to unbundle doesn't exists:", baseDirectoryTree)
    for( let file of fs.readdirSync( baseDirectoryTree ) ){
        let destinationDirectory = path.join( baseDestinationDirectory, path.basename(file) )
        let fileSourcePath = path.join( baseDirectoryTree, file )
        if(  !fs.lstatSync( fileSourcePath ).isDirectory() ){
            unpackedCount.totalFiles ++
            destinationDirectory = path.dirname( destinationDirectory )
            selectQueueBySize( file, destinationDirectory, fileSourcePath, queuesFunctions, unpackingTimeout, sizeLimit )
        }
        //else await unpackFsTree( fileSourcePath, destinationDirectory, queuesFunctions, sizeLimit, unpackingTimeout )
        else unpackFsTree( fileSourcePath, destinationDirectory, queuesFunctions, sizeLimit, unpackingTimeout )
    }
}

// Returns a promise, which will resolve for the bundle object
async function unpackBundle( input, fileDestinationPath, fileSourcePath, unpackingTimeout ){
    let bundle;
    try{
        bundle = await runWebcrackInWorker(input, { unpack: true, unminify: true, deobfuscate: true }, unpackingTimeout)
    }catch(e){
        console.error( e.message )
        writeToFs( input, fileDestinationPath, fileSourcePath )
        console.log(`Error unpacking. File ${fileDestinationPath} written as is`)
        return
    }
    saveBundle( fileDestinationPath, bundle, fileSourcePath )
}

function selectQueueBySize( file, destinationDirectory, fileSourcePath, queuesFunctions, unpackingTimeout, sizeLimit ){
    let size = fs.statSync( fileSourcePath ).size
    let input = fs.readFileSync( fileSourcePath , 'utf8');
    let fileDestinationPath = path.join( destinationDirectory, file )
    if( !sizeLimit || size < sizeLimit ){
        queuesFunctions.queueUnpackSmallBundle( input, fileDestinationPath, fileSourcePath, unpackingTimeout )
    }
    else{
        queuesFunctions.queueUnpackBigBundle( input, fileDestinationPath, fileSourcePath, unpackingTimeout )
        unpackedCount.sizeLimit ++
    }
}


function saveBundle( directory, webpackBundleObject, fileSourcePath ){
    //if( webpackBundleObject.scripts.length > 1 ){
    if( webpackBundleObject.scripts[0].bundleName ){
        for( let script of webpackBundleObject.scripts ){
            let { bundleName, generatedCode } = script
            let fileName = path.join( path.dirname(directory), `${path.basename(directory)}.unpacked`, `${bundleName}.js` )
            writeToFs( generatedCode, fileName )
        }
        unpackedCount.unpackedFiles ++
    }
    else{
        // Save the file as it is, with no name change
        writeToFs( webpackBundleObject.scripts[0].generatedCode, directory, fileSourcePath )
        console.log(`No modules found, file ${directory} written as is.`)
    }
}

// This function is used when the unpacking failed either for timeout, an error or file size
// a third optional parameter is passed if instead of writing the file from the bundle object, it is desired to just beautify it
function writeToFs( input, fileDestinationPath, fileSourcePath ){
    if( createPathDirectories( fileDestinationPath ) ){
        if( !fileSourcePath ){
            if( !fs.existsSync(fileDestinationPath) ) fs.writeFileSync( fileDestinationPath, input )
            //console.log("[FILE WRITTEN]", fileDestinationPath)
        }
        else{
            prettier.format( input, { parser: 'babel' }).then( input => {
                if( !fs.existsSync(fileDestinationPath) ) fs.writeFileSync( fileDestinationPath, input )
            }).catch( err => {
                console.log( `Couldn't parse file ${fileSourcePath}. Writing unbeautified.`, err )
                fs.copyFileSync( fileSourcePath, fileDestinationPath )
            })
        }
        //console.log("[FILE WRITTEN]", fileDestinationPath) 
    }
    else{console.error("Error Creating directory", fileDestinationPath)}
}

// Makes a check that the directory into which we are writing exists, and if it doesn't it creates it
function createPathDirectories( filePath ){
    let fileDir = path.dirname( filePath )
    try{
        if( !fs.existsSync(fileDir) ) fs.mkdirSync( fileDir , { recursive: true });
        return filePath
    } catch (err) { console.error(`Error adding file:`, filePath, err) }
}

function runWebcrackInWorker(input, options, unpackingTimeout){
    return new Promise((resolve, reject) => {
        let worker = new Worker( path.join( path.dirname( fileURLToPath(import.meta.url) ), '/webcrackWorker.js' ), {
            workerData: { input, options }
        });

        // Set the timeout to terminate the worker if it takes too long
        let timeout = setTimeout(() => {
            worker.terminate();  // Terminate the worker
            reject(new Error('Worker timed out'));
            unpackedCount.timedOut ++
        }, unpackingTimeout);

        worker.on('message', (message) => {
            clearTimeout(timeout);
            let jsonObj = JSON.parse( message )
            if ( jsonObj.error ) {
                reject(new Error(message.error));
            }
            if ( jsonObj.scripts ) {
                resolve( jsonObj )
                worker.terminate();
            }
            else{
                console.log( message )
            }
        });

        worker.on('error', (err) => {
            clearTimeout(timeout);  // Clear the timeout if there's an error
            reject(err);
        });

        worker.on('exit', (code) => {
            clearTimeout(timeout);  // Clear the timeout when the worker exits
            if (code !== 0) {
                reject(new Error(`Worker stopped with exit code ${code}`));
            }
        });
    });
}



/*
ChatGPT prompt

based on the functionality and konwing that the file is in the path "", how would you name this file. Is a file form indeed source code ""
Rename all of the variables in it to suitibly match their function and give me a json object that maps them (or just the script itself,
the problem with a map is the scope, in where it could be variables with the same name in different scopes)
*/