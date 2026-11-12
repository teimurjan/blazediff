# Object Diffing Benchmarks

Deep-diff comparisons for plain JS objects and arrays.

## Object (`@blazediff/object` vs `microdiff`)

_10000 iterations (50 warmup)_

> **~13.7%** performance improvement on average.

<table>
  <thead>
    <tr>
      <th width="500">Benchmark</th>
      <th width="500">Microdiff</th>
      <th width="500">BlazeDiff</th>
      <th width="500">Time Saved</th>
      <th width="500">% Improvement</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>complex object - tag addition</td>
      <td>0.0024ms</td>
      <td>0.0017ms</td>
      <td>0.0006ms</td>
      <td>26.6%</td>
    </tr>
    <tr>
      <td>deep nested - timeout change</td>
      <td>0.0012ms</td>
      <td>0.0012ms</td>
      <td>0.0001ms</td>
      <td>4.4%</td>
    </tr>
    <tr>
      <td>large array - single item change</td>
      <td>0.3203ms</td>
      <td>0.2515ms</td>
      <td>0.0688ms</td>
      <td>21.5%</td>
    </tr>
    <tr>
      <td>large identical arrays</td>
      <td>0.0563ms</td>
      <td>0.0026ms</td>
      <td>0.0537ms</td>
      <td>95.4%</td>
    </tr>
    <tr>
      <td>large nested object - multiple small changes</td>
      <td>1.9823ms</td>
      <td>1.5978ms</td>
      <td>0.3845ms</td>
      <td>19.4%</td>
    </tr>
    <tr>
      <td>nested object - theme change</td>
      <td>0.0019ms</td>
      <td>0.0015ms</td>
      <td>0.0004ms</td>
      <td>20.3%</td>
    </tr>
    <tr>
      <td>simple object - age change</td>
      <td>0.0002ms</td>
      <td>0.0003ms</td>
      <td>-0.0001ms</td>
      <td>-72.0%</td>
    </tr>
    <tr>
      <td>simple object - identical</td>
      <td>0.0002ms</td>
      <td>0.0002ms</td>
      <td>-0.0000ms</td>
      <td>-5.8%</td>
    </tr>
  </tbody>
</table>

_Benchmarks run on GCP c4-standard-16 (Intel Xeon Platinum 8581C), Node.js 22_
