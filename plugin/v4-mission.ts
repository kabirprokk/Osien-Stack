import type { Plugin } from "@opencode-ai/plugin"
import * as m from "../lib/v4mission"

export default (async () => ({ tool: {
      mission_start: {
    description: "Create a durable V4 mission with milestones, completion contracts, budgets, and authoritative persisted state.",
    args: { type:"object", required:["goal"], properties:{id:{type:"string"},goal:{type:"string"},milestones:{type:"string",description:"JSON milestone array; each has id, goal, completion[]"},completion:{type:"string"},budgets:{type:"string"}} },
    async execute(a:any){ try{return m.createMission(a)}catch(e:any){return "ERROR: "+e.message} },
  },
      mission_status: {
    description: "Read the authoritative persisted mission plan, state, and evidence count. Conversation is not used.",
    args:{type:"object",required:["mission_id"],properties:{mission_id:{type:"string"}}},
    async execute(a:any){ try{return m.missionStatus(a)}catch(e:any){return "ERROR: "+e.message} },
  },
      mission_lease: {
    description: "Acquire or renew an exclusive mission execution lease. Prevents two agents operating the same mission.",
    args:{type:"object",required:["mission_id","owner"],properties:{mission_id:{type:"string"},owner:{type:"string"},minutes:{type:"number"}}},
    async execute(a:any){ try{return m.acquireLease(a)}catch(e:any){return "ERROR: "+e.message} },
  },
      mission_heartbeat: {
    description: "Renew a mission lease and update progress liveness.",
    args:{type:"object",required:["mission_id","owner"],properties:{mission_id:{type:"string"},owner:{type:"string"},minutes:{type:"number"}}},
    async execute(a:any){ try{return m.heartbeat(a)}catch(e:any){return "ERROR: "+e.message} },
  },
      mission_next: {
    description: "Select exactly one next milestone/action. Never executes an entire mission in one step.",
    args:{type:"object",required:["mission_id"],properties:{mission_id:{type:"string"}}},
    async execute(a:any){ try{return m.next(a)}catch(e:any){return "ERROR: "+e.message} },
  },
      mission_evidence: {
    description: "Append immutable FACT, CLAIM, HYPOTHESIS, or GOAL evidence with provenance and confidence.",
    args:{type:"object",required:["mission_id","kind","subject"],properties:{mission_id:{type:"string"},kind:{type:"string"},subject:{type:"string"},criterion:{type:"string"},source:{type:"string"},verified:{type:"boolean"},confidence:{type:"number"},scope:{type:"string"},artifact:{type:"string",description:"semicolon-separated files whose fingerprint this evidence verifies"},fingerprint:{type:"string"}}},
    async execute(a:any){ try{return m.addEvidence(a)}catch(e:any){return "ERROR: "+e.message} },
  },
      mission_action_begin: {
    description: "Persist one idempotent action before execution. Requires a valid lease and action_id.",
    args:{type:"object",required:["mission_id","owner","action_id","intent"],properties:{mission_id:{type:"string"},owner:{type:"string"},action_id:{type:"string"},intent:{type:"string"},precondition:{type:"string"},postcondition:{type:"string"}}},
    async execute(a:any){ try{return m.actionBegin(a)}catch(e:any){return "ERROR: "+e.message} },
  },
      mission_action_finish: {
    description: "Persist exactly one action result and postcondition verification after execution.",
    args:{type:"object",required:["mission_id","action_id"],properties:{mission_id:{type:"string"},action_id:{type:"string"},success:{type:"boolean"},result:{type:"string"},postcondition_verified:{type:"boolean"}}},
    async execute(a:any){ try{return m.actionFinish(a)}catch(e:any){return "ERROR: "+e.message} },
  },
      mission_replan: {
    description: "Create a new plan revision without overwriting prior plans; record evidence/reason for strategy change.",
    args:{type:"object",required:["mission_id","reason"],properties:{mission_id:{type:"string"},reason:{type:"string"},rejected_hypothesis:{type:"string"},milestones:{type:"string"},plan:{type:"string"}}},
    async execute(a:any){ try{return m.replan(a)}catch(e:any){return "ERROR: "+e.message} },
  },
      mission_block: {
    description: "Mark a mission BLOCKED or FAILED with an explicit resume condition.",
    args:{type:"object",required:["mission_id","status","reason"],properties:{mission_id:{type:"string"},status:{type:"string"},reason:{type:"string"},resume_when:{type:"string"}}},
    async execute(a:any){ try{return m.block(a)}catch(e:any){return "ERROR: "+e.message} },
  },
      mission_complete: {
    description: "Guarded completion: refuses unless every milestone completion contract has fresh verified FACT evidence.",
    args:{type:"object",required:["mission_id"],properties:{mission_id:{type:"string"}}},
    async execute(a:any){ try{return m.complete(a)}catch(e:any){return "ERROR: "+e.message} },
  },
      capability_probe: {
    description: "Build a capability matrix from runtime registration, successful execution, and errors. Registered is not proven.",
    args:{type:"object",properties:{tools:{type:"string",description:"optional JSON array of tool names"}}},
    async execute(a:any){ try{return m.probe(a)}catch(e:any){return "ERROR: "+e.message} },
  },
      capability_route_v4: {
    description: "Route autonomy only through PROVEN healthy capabilities; safe_for_autonomy is independent from health.",
    args:{type:"object",properties:{intent:{type:"string"}}},
    async execute(a:any){ try{return m.route(a)}catch(e:any){return "ERROR: "+e.message} },
  },
} })) satisfies Plugin
