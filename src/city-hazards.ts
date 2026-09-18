import * as THREE from "three";
import { seeded } from "./city-models";

/** Flooded streets keep the raised assembly plaza and northern hospital dry. */
export class FloodDistrict {
  readonly group = new THREE.Group();
  private readonly material: THREE.ShaderMaterial;
  private readonly debris: THREE.Mesh[] = [];

  constructor() {
    this.material = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, severity: { value: 0.7 } },
      vertexShader: `varying vec3 world; void main() { vec4 p=modelMatrix*vec4(position,1.0); world=p.xyz; gl_Position=projectionMatrix*viewMatrix*p; }`,
      fragmentShader: `varying vec3 world; uniform float time; uniform float severity;
        void main() {
          float wave=sin(world.x*1.8+world.z*2.4-time*3.0)*sin(world.z*0.8-time*1.7);
          float foam=pow(max(0.0,sin(world.x*0.7+world.z*3.6+sin(world.x*2.2-time)-time*4.0)),18.0)*pow(max(0.0,sin(world.x*1.4-time)),4.0);
          vec3 muddy=mix(vec3(0.12,0.26,0.28),vec3(0.27,0.37,0.32),severity);
          vec3 color=muddy+wave*0.065+foam*vec3(0.20,0.24,0.21);
          gl_FragColor=vec4(color,1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      side: THREE.DoubleSide,
    });
    for (const [x,z,width,depth] of [[2,82,238,11], [24,65,9,29], [68,65,9,29], [-64,64,9,30], [-87,58,30,18]]) {
      const water = new THREE.Mesh(new THREE.PlaneGeometry(width,depth),this.material);
      water.rotation.x=-Math.PI/2; water.position.set(x,0.53,z); this.group.add(water);
    }
    const wood = new THREE.MeshStandardMaterial({color:0x74624c,roughness:0.9});
    for(let i=0;i<22;i++) {
      const piece=new THREE.Mesh(new THREE.BoxGeometry(0.3+seeded(i)*0.6,0.12,0.8+seeded(i+12)*1.5),wood);
      piece.position.set(-110+seeded(i+3)*220,0.58,79+seeded(i+9)*6);
      piece.rotation.y=seeded(i+7)*Math.PI; piece.userData.startX=piece.position.x;
      this.debris.push(piece); this.group.add(piece);
    }
  }
  update(time:number,risk:number):void {
    this.group.visible=risk>35; this.material.uniforms.time.value=time; this.material.uniforms.severity.value=risk/100;
    const rise=Math.max(0,risk-65)*0.008;
    this.group.position.y=rise;
    this.debris.forEach((p,i)=>{p.position.x=-115+((p.userData.startX+115+time*0.45)%230);p.position.y=0.58+Math.sin(time*2+i)*0.035;p.rotation.y+=Math.sin(time+i)*0.0008;});
  }
}

export function flameMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms:{time:{value:0}}, transparent:true, depthWrite:false, side:THREE.DoubleSide,
    vertexShader:`varying vec2 uvFlame; varying float seed; void main(){uvFlame=uv; seed=instanceMatrix[3].y;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.0);}`,
    fragmentShader:`varying vec2 uvFlame; varying float seed; uniform float time;
      void main(){
        float y=uvFlame.y;
        float sway=sin(y*13.0-time*7.0+seed)*0.09*y+sin(y*27.0-time*11.0)*0.035;
        float x=abs(uvFlame.x-0.5+sway);
        float width=(1.0-y)*0.45;
        float shape=1.0-smoothstep(width*0.5,width+0.025,x);
        float tip=smoothstep(1.0,0.75,y)*smoothstep(0.0,0.1,y);
        float core=(1.0-smoothstep(0.0,width,x))*(1.0-y);
        vec3 color=mix(vec3(1.0,0.12,0.008),vec3(1.0,0.85,0.22),core);
        gl_FragColor=vec4(color,shape*tip*0.9);
        #include <colorspace_fragment>
      }`,
  });
}
