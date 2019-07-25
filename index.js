'use strict'

const Libp2p = require('libp2p')
const IPFS = require('ipfs')
const TCP = require('libp2p-tcp')
const MulticastDNS = require('libp2p-mdns')
const WebSocketStar = require('libp2p-websocket-star')
const Bootstrap = require('libp2p-bootstrap')
const SPDY = require('libp2p-spdy')
const KadDHT = require('libp2p-kad-dht')
const MPLEX = require('pull-mplex')
const SECIO = require('libp2p-secio')
const assert = require('assert')
const Protector = require('libp2p-pnet')

const fs = require('fs')
const path = require('path')
const Repo = require('ipfs-repo')
const fsLock = require('ipfs-repo/src/lock')

const repoPath = path.resolve('./tmp/custom-repo/.ipfs')
const swarmKeyPath = path.join(repoPath, 'swarm.key')

// const customRepositoryOptions = {

//   /**
//    * IPFS nodes store different information in separate storageBackends, or datastores.
//    * Each storage backend can use the same type of datastore or a different one — you
//    * could store your keys in a levelDB database while everything else is in files,
//    * for example. (See https://github.com/ipfs/interface-datastore for more about datastores.)
//    */

//   storageBackends: {
//     root: require('datastore-fs'), // version and config data will be saved here
//     blocks: require('datastore-fs'),
//     keys: require('datastore-fs'),
//     datastore: require('datastore-fs')
//   },

//   /**
//    * Storage Backend Options will get passed into the instantiation of their counterpart
//    * in `storageBackends`. If you create a custom datastore, this is where you can pass in
//    * custom constructor arguments. You can see an S3 datastore example at:
//    * https://github.com/ipfs/js-datastore-s3/tree/master/examples/full-s3-repo
//    *
//    * NOTE: The following options are being overriden for demonstration purposes only.
//    * In most instances you can simply use the default options, by not passing in any
//    * overrides, which is recommended if you have no need to override.
//    */
//   storageBackendOptions: {
//     root: {
//      // extension: '.ipfsroot', // Defaults to ''. Used by datastore-fs; Appended to all files
//       errorIfExists: false, // Used by datastore-fs; If the datastore exists, don't throw an error
//       createIfMissing: true // Used by datastore-fs; If the datastore doesn't exist yet, create it
//     },
//     blocks: {
//       sharding: false, // Used by IPFSRepo Blockstore to determine sharding; Ignored by datastore-fs
//       //extension: '.ipfsblock', // Defaults to '.data'.
//       errorIfExists: false,
//       createIfMissing: true
//     },
//     keys: {
//     //  extension: '.ipfskey', // No extension by default
//       errorIfExists: false,
//       createIfMissing: true
//     },
//     datastore: {
//     //  extension: '.ipfsds', // No extension by default
//       errorIfExists: false,
//       createIfMissing: true
//     }
//   },

//   /**
//    * A custom lock can be added here. Or the build in Repo `fs` or `memory` locks can be used.
//    * See https://github.com/ipfs/js-ipfs-repo for more details on setting the lock.
//    */
//   lock: fsLock
// }

/**
 * Options for the libp2p bundle
 * @typedef {Object} libp2pBundle~options
 * @property {PeerInfo} peerInfo - The PeerInfo of the IPFS node
 * @property {PeerBook} peerBook - The PeerBook of the IPFS node
 * @property {Object} config - The config of the IPFS node
 * @property {Object} options - The options given to the IPFS node
 */

/**
 * This is the bundle we will use to create our fully customized libp2p bundle.
 *
 * @param {libp2pBundle~options} opts The options to use when generating the libp2p node
 * @returns {Libp2p} Our new libp2p node
 */
const libp2pBundle = (opts) => {

  // Set convenience variables to clearly showcase some of the useful things that are available
  const peerInfo = opts.peerInfo
  const peerBook = opts.peerBook
  const bootstrapList = opts.config.Bootstrap

  // Create our WebSocketStar transport and give it our PeerId, straight from the ipfs node
  const wsstar = new WebSocketStar({
    id: peerInfo.id
  })

  // Build and return our libp2p node
  return new Libp2p({
    peerInfo,
    peerBook,

    // Lets limit the connection managers peers and have it check peer health less frequently
    connectionManager: {
      minPeers: 25,
      maxPeers: 100,
      pollInterval: 5000
    },
    modules: {
      transport: [
        TCP,
        wsstar
      ],
      streamMuxer: [
        MPLEX,
        SPDY
      ],
      connEncryption: [
        SECIO
      ],
      peerDiscovery: [
        MulticastDNS,
        Bootstrap,
        wsstar.discovery
      ],
      dht: KadDHT,
      //set private connector
      connProtector: new Protector(fs.readFileSync(swarmKeyPath))
    },
    config: {
      peerDiscovery: {
        autoDial: true, // auto dial to peers we find when we have less peers than `connectionManager.minPeers`
        mdns: {
          interval: 10000,
          enabled: true
        },
        bootstrap: {
          interval: 30e3,
          enabled: true,
          list: bootstrapList
        }
      },
      // Turn on relay with hop active so we can connect to more peers
      relay: {
        enabled: true,
        hop: {
          enabled: true,
          active: true
        }
      },
      dht: {
        enabled: true,
        kBucketSize: 20,
        randomWalk: {
          enabled: true,
          interval: 10e3, // This is set low intentionally, so more peers are discovered quickly. Higher intervals are recommended
          timeout: 2e3 // End the query quickly since we're running so frequently
        }
      },
      EXPERIMENTAL: {
        pubsub: true
      }
    }
  })
}

// Read the swarmKey on repo  path

const mNodeAddr = '/ip4/129.211.127.83/tcp/4001/ipfs/QmXt4bwenzr8apvhE1Lkn2HjKcdT5EZppk5P1TK9rr8B9v'
// Now that we have our custom libp2p bundle, let's start up the ipfs node!
const node = new IPFS({
  libp2p: libp2pBundle,
  repo: repoPath,
  // libp2p: privateLibp2pBundle(swarmKeyPath),
  config: {
    Addresses: {
      // Set the swarm address so we dont get port collision on the nodes
      Swarm: ['/ip4/0.0.0.0/tcp/9101']
    }
  }
})

console.log('auto starting my node...')

const setBootstrap = async () => {
  console.log('setting bootstrap node...')
  // query bootsrap nodes
  await node.bootstrap.list(function (err, res) {
    console.log('query bootsrap node list :', res.Peers)
  })
  await node.bootstrap.rm(null, { all: true }, function (err, res) {
    if (err) {
      console.log(err)
    }
    console.log(res)
  })
  await node.bootstrap.add(mNodeAddr, false, function (err, res) {
    if (err) {
      console.log(err)
    }
    console.log(res)
  })

}

// Listen for the node to start, so we can log out some metrics
node.once('start', (err) => {
  assert.ifError(err, 'Should startup without issue')

  //set bootstrap nodes
  setBootstrap()
  // node.swarm.connect(mNodeAddr)
  // Lets log out the number of peers we have every 2 seconds
  setInterval(() => {
    node.swarm.peers((err, peers) => {
      if (err) {
        console.log('An error occurred trying to check our peers:', err)
        process.exit(1)
      }
      console.log(`The node now has ${peers.length} peers.`)
      console.log('Those peers are: ')
      peers.forEach(element => {
        console.log(element.addr, element.peer._idB58String);
      });
    })
  }, 1000)

  // Log out the bandwidth stats every 4 seconds so we can see how our configuration is doing
  setInterval(() => {
    node.stats.bw((err, stats) => {
      if (err) {
        console.log('An error occurred trying to check our stats:', err)
      }
      console.log(`\nBandwidth Stats: ${JSON.stringify(stats, null, 2)}\n`)
    })
  }, 4000)
})
